import type { MissionArtifact } from "./api";

export type ArtifactTreeNode = {
  name: string;
  /** Full path segment chain (e.g. frontend/src/App.tsx) */
  fullPath: string;
  isFile: boolean;
  artifactId?: string;
  children: ArtifactTreeNode[];
};

/** Keep latest artifact per path (by createdAt). */
export function dedupeArtifactsByPath(artifacts: MissionArtifact[]): MissionArtifact[] {
  const map = new Map<string, MissionArtifact>();
  for (const a of artifacts) {
    const prev = map.get(a.path);
    if (!prev || a.createdAt > prev.createdAt) map.set(a.path, a);
  }
  return [...map.values()].sort((x, y) => x.path.localeCompare(y.path));
}

export function buildArtifactTree(artifacts: MissionArtifact[]): ArtifactTreeNode {
  const deduped = dedupeArtifactsByPath(artifacts);
  const root: ArtifactTreeNode = { name: "", fullPath: "", isFile: false, children: [] };

  for (const art of deduped) {
    const parts = art.path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath: acc,
          isFile,
          children: [],
          ...(isFile ? { artifactId: art.id } : {}),
        };
        node.children.push(child);
      } else if (isFile) {
        child.isFile = true;
        child.artifactId = art.id;
      }
      node = child;
    }
  }

  const sortTree = (n: ArtifactTreeNode) => {
    n.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortTree);
  };
  sortTree(root);
  return root;
}
