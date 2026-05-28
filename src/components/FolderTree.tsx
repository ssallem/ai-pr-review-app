/**
 * 전체 소스 리뷰 — repo 폴더 트리 미리보기 + 체크박스 선택 컴포넌트.
 *
 * 사용자가 repo 폴더 구조를 모를 때 GitHub 사이트에 다시 들어가지 않고도
 * 디렉토리 필터를 시각적으로 고를 수 있게 한다. Controlled 컴포넌트 —
 * 선택 상태(`selected`)는 부모가 보유하고, 토글마다 `onChange`로 새 배열을 방출한다.
 *
 * 선택 표현: trailing-slash prefix 배열 (예: ['src/', 'lib/']).
 *   - applyFilters 의 prefix 매칭(path.startsWith)과 일치하도록 항상 trailing slash 유지.
 *   - 상위 폴더가 선택되면 하위는 자동 커버 — 중복 prefix 는 토글 시 제거(불변성: spread).
 *
 * 시스템 경계 검증: fetchRepoTree 응답은 githubClient.ts 에서 정규화된 TreeBlob[] 만 받는다.
 */
import { useCallback, useEffect, useState, type FC } from 'react';

import {
  fetchRepoTree,
  type ParsedRepoUrl,
  type TreeBlob,
} from '../lib/githubClient';
import { getGithubToken } from '../lib/storage';

interface FolderTreeProps {
  parsed: ParsedRepoUrl;
  /** trailing-slash prefix 배열, 예: ['src/', 'lib/'] */
  selected: string[];
  onChange: (paths: string[]) => void;
}

/** 트리 노드 — path 는 trailing slash 포함 전체 prefix. */
interface FolderNode {
  name: string;
  /** trailing slash 포함 전체 prefix (예: 'src/components/'). */
  path: string;
  children: FolderNode[];
}

/** loading | error | ready 상태를 단일 union 으로 표현. */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; roots: FolderNode[]; truncated: boolean };

/**
 * blob 경로 목록에서 모든 조상 디렉토리 prefix(파일명 제외)를 수집해 중첩 트리로 만든다.
 * 예: 'src/components/x.ts' → 'src/', 'src/components/' prefix 생성.
 * children 은 name 알파벳순 정렬.
 */
function buildTree(tree: TreeBlob[]): FolderNode[] {
  // 1) 고유 디렉토리 prefix 집합 수집 (파일명 제외).
  const prefixes = new Set<string>();
  for (const blob of tree) {
    const segments = blob.path.split('/');
    // 마지막 segment 는 파일명 — 제외. 조상 디렉토리만 누적.
    let acc = '';
    for (let i = 0; i < segments.length - 1; i++) {
      acc += `${segments[i]}/`;
      prefixes.add(acc);
    }
  }

  // 2) prefix 집합 → 중첩 노드. parent path 로 children 연결.
  const nodeByPath = new Map<string, FolderNode>();
  const getNode = (path: string, name: string): FolderNode => {
    let node = nodeByPath.get(path);
    if (!node) {
      node = { name, path, children: [] };
      nodeByPath.set(path, node);
    }
    return node;
  };

  const roots: FolderNode[] = [];
  for (const prefix of prefixes) {
    // prefix 'src/components/' → segments ['src','components',''] → 마지막 빈 문자열 제거.
    const segs = prefix.split('/').filter((s) => s.length > 0);
    const name = segs[segs.length - 1] ?? prefix;
    const node = getNode(prefix, name);

    if (segs.length === 1) {
      roots.push(node);
    } else {
      const parentPath = `${segs.slice(0, -1).join('/')}/`;
      const parentName = segs[segs.length - 2] ?? parentPath;
      const parent = getNode(parentPath, parentName);
      // 동일 prefix 중복 push 방지 — Set 순회라 부모가 자식보다 먼저/나중 모두 가능.
      if (!parent.children.includes(node)) parent.children.push(node);
    }
  }

  // 3) 재귀 정렬 (name 알파벳순).
  const sortRec = (nodes: FolderNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

const FolderTree: FC<FolderTreeProps> = ({ parsed, selected, onChange }) => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // 펼침 상태 — 루트(depth 0)만 기본 펼침, 나머지 접힘.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 재시도/새로고침 트리거 — 증가 시 useEffect 재실행.
  const [reloadKey, setReloadKey] = useState(0);

  const { owner, repo } = parsed;

  // mount + owner/repo 변경 + 새로고침 시 자동 로드.
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    // repo 변경/새로고침 시 이전 펼침 상태 잔재 제거 (ready 시점에 루트만 다시 펼침).
    setExpanded(new Set());

    void (async () => {
      try {
        const token = await getGithubToken();
        const result = await fetchRepoTree({ owner, repo }, token ?? undefined);
        if (cancelled) return;
        const roots = buildTree(result.tree);
        setState({ kind: 'ready', roots, truncated: result.treeWasTruncated });
        // 루트만 기본 펼침.
        setExpanded(new Set(roots.map((r) => r.path)));
      } catch (e) {
        if (cancelled) return;
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, reloadKey]);

  /** selected 중 path 의 조상이거나 자기 자신인 prefix 가 있으면 커버됨. */
  const isCovered = useCallback(
    (path: string): boolean => selected.some((s) => path === s || path.startsWith(s)),
    [selected],
  );

  /** selected 에 직접(정확히 일치) 들어있는지 — 해제 가능 여부 판정. */
  const isDirectlySelected = useCallback(
    (path: string): boolean => selected.includes(path),
    [selected],
  );

  const toggleExpand = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleToggle = (node: FolderNode): void => {
    // 조상 prefix 로만 커버된(직접 선택 아님) 노드는 disabled 렌더 — 어떤 경로로도 추가 토글 차단.
    if (isCovered(node.path) && !isDirectlySelected(node.path)) return;
    if (isDirectlySelected(node.path)) {
      // 직접 선택된 것만 해제 가능.
      onChange(selected.filter((s) => s !== node.path));
      return;
    }
    // 추가: 자기 자신 + 하위 prefix 제거 후 추가 (중복 방지, 불변성: 새 배열).
    const next = [
      ...selected.filter((s) => s !== node.path && !s.startsWith(node.path)),
      node.path,
    ];
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-border bg-surface-alt">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold text-text-secondary">
          <span aria-hidden="true">📁</span> 폴더 트리
        </span>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={state.kind === 'loading'}
          className="text-xs text-text-muted hover:text-text-secondary disabled:opacity-50"
          aria-label="폴더 트리 새로고침"
        >
          ↻ 새로고침
        </button>
      </div>

      <div className="max-h-72 overflow-auto p-2">
        {state.kind === 'loading' && (
          <p className="px-2 py-3 text-sm text-text-muted animate-pulse">
            폴더 트리를 불러오는 중…
          </p>
        )}

        {state.kind === 'error' && (
          <div className="px-2 py-3">
            <p className="text-sm text-severity-critical">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-100 hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {state.kind === 'ready' && state.roots.length === 0 && (
          <p className="px-2 py-3 text-sm text-text-muted">
            하위 폴더가 없습니다 (루트에 파일만 존재) — 디렉토리 필터 없이 전체가 분석됩니다
          </p>
        )}

        {state.kind === 'ready' && state.truncated && (
          <p className="mb-2 px-2 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-200">
            ⚠ 폴더 수가 많아 일부만 표시됩니다. 정확히 필터하려면 아래 수동 입력을 사용하세요.
          </p>
        )}

        {state.kind === 'ready' && state.roots.length > 0 && (
          <ul role="tree">
            {state.roots.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                isCovered={isCovered}
                isDirectlySelected={isDirectlySelected}
                onToggleExpand={toggleExpand}
                onToggleCheck={handleToggle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

interface TreeRowProps {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  isCovered: (path: string) => boolean;
  isDirectlySelected: (path: string) => boolean;
  onToggleExpand: (path: string) => void;
  onToggleCheck: (node: FolderNode) => void;
}

/** 단일 폴더 행 + 재귀 children. */
const TreeRow: FC<TreeRowProps> = ({
  node,
  depth,
  expanded,
  isCovered,
  isDirectlySelected,
  onToggleExpand,
  onToggleCheck,
}) => {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.path);
  const covered = isCovered(node.path);
  const direct = isDirectlySelected(node.path);
  // 조상 prefix 로만 커버된 경우 — 직접 토글 불가(상위에서 이미 포함).
  const coveredByAncestorOnly = covered && !direct;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className="flex items-center gap-1 py-1 rounded hover:bg-surface"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleExpand(node.path)}
            className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-secondary shrink-0"
            aria-label={isOpen ? '접기' : '펼치기'}
          >
            <span className={`inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" aria-hidden="true" />
        )}

        <input
          type="checkbox"
          checked={covered}
          disabled={coveredByAncestorOnly}
          onChange={() => onToggleCheck(node)}
          className="accent-brand-500 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`${node.path} 선택`}
        />

        <span
          className={`text-sm truncate ${
            covered ? 'text-brand-600 dark:text-brand-100 font-medium' : 'text-text-secondary'
          }`}
        >
          {node.name}/
        </span>

        {coveredByAncestorOnly && (
          <span className="ml-1 text-xs text-text-muted shrink-0">(상위 포함)</span>
        )}
      </div>

      {hasChildren && isOpen && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              isCovered={isCovered}
              isDirectlySelected={isDirectlySelected}
              onToggleExpand={onToggleExpand}
              onToggleCheck={onToggleCheck}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export default FolderTree;
