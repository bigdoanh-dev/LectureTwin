import type { ConceptEdge, ConceptNode } from './types';

export const knowledgeNodeSize = { width: 184, height: 68 };
export function knowledgeRelationLabel(edge: ConceptEdge): string {
  return edge.label || ({ prerequisite: 'Tiên quyết cho', related: 'Liên quan đến', uses: 'Sử dụng', compared_in: 'So sánh trong' } as Record<string, string>)[edge.type] || 'Liên kết với';
}
export function knowledgeSearchText(value: string) {
  return value.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();
}

/** A stable layered layout independent of screen size, including disconnected/cyclic nodes. */
export function knowledgeMapLayout(concepts: ConceptNode[], relationships: ConceptEdge[]) {
  const unique = concepts.filter((node, i) => concepts.findIndex(item => item.id === node.id) === i);
  const ids = new Set(unique.map(node => node.id));
  const seen = new Set<string>();
  const edges = relationships.filter(edge => {
    const key = JSON.stringify([edge.source, edge.target, edge.type, edge.label]);
    if (edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const indegree = new Map(unique.map(node => [node.id, 0]));
  const outgoing = new Map(unique.map(node => [node.id, [] as string[]]));
  edges.forEach(edge => {
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
    outgoing.get(edge.source)!.push(edge.target);
  });
  const ranks = new Map(unique.map(node => [node.id, 0]));
  const queue = unique.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const target of outgoing.get(id)!) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(id)! + 1));
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  const maxRank = Math.max(0, ...ranks.values());
  const groups = Array.from({ length: maxRank + 1 }, () => [] as ConceptNode[]);
  unique.forEach(node => groups[ranks.get(node.id)!].push(node));
  const { width, height } = knowledgeNodeSize;
  const canvasHeight = Math.max(340, 80 + Math.max(0, ...groups.map(group => group.length)) * (height + 28) - 28);
  const nodes = groups.flatMap((group, rank) => group.map((node, i) => ({ ...node,
    x: 36 + rank * (width + 104),
    y: (canvasHeight - (group.length * (height + 28) - 28)) / 2 + i * (height + 28),
  })));
  return { nodes, edges,
    width: Math.max(680, 72 + (maxRank + 1) * width + maxRank * 104),
    height: canvasHeight,
  };
}
