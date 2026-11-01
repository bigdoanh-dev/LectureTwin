import type { ConceptNode, Evidence, Workspace } from './types';

export function parseStudentTimestamp(value: string): number | null {
  const input = value.trim();
  if (!/^\d+(?::[0-5]\d)?$/.test(input)) return null;
  const parts = input.split(':').map(Number);
  const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  return Number.isSafeInteger(seconds) ? seconds : null;
}

/** Student-facing links must come from the published workspace and confirmed sources. */
export function studentLearningOverview(workspace: Workspace | null) {
  const concepts = (workspace?.concepts ?? []).filter(concept => concept.verified);
  const conceptIds = new Set(concepts.map(concept => concept.id));
  const evidence = (workspace?.evidence ?? []).filter(item => item.valid && item.verified && conceptIds.has(item.concept_id));
  const evidenceById = new Map(evidence.map(item => [item.id, item]));
  const sourcesFor = (conceptId: string): Evidence[] => {
    const preferred = workspace?.research?.concepts.find(row => row.concept_id === conceptId)?.evidence_ids ?? [];
    const ordered = preferred.map(id => evidenceById.get(id)).filter((item): item is Evidence => item?.concept_id === conceptId);
    return [...ordered, ...evidence.filter(item => item.concept_id === conceptId && !preferred.includes(item.id))];
  };
  const researchObjectives = workspace?.research?.objectives ?? [];
  const objectiveTitles = workspace?.planned.objectives.length ? workspace.planned.objectives : workspace?.lecture.objectives ?? [];
  const objectives = objectiveTitles.map((title, index) => {
    const mapping = researchObjectives.find(item => item.title === title);
    const hasConfirmedMapping = Boolean(mapping && mapping.status === 'confirmed' && mapping.version === workspace?.lecture.version);
    return {
      id: mapping?.id ?? `objective-${index}`,
      title,
      hasConfirmedMapping,
      concepts: hasConfirmedMapping ? concepts.filter(concept => mapping!.confirmed_concept_ids.includes(concept.id)) : [],
    };
  });
  const knowledge = concepts.map(concept => ({ ...concept, sources: sourcesFor(concept.id) }));
  const outline = (workspace?.planned.segments ?? []).map(segment => {
    const ids = segment.concept_ids ?? [segment.concept_id];
    return { ...segment, evidence: ids.flatMap(sourcesFor).find(item => item.kind !== 'slide' && item.start !== null) ?? null };
  });
  const primaryVideo = workspace?.assets.find(asset => asset.kind === 'video' && asset.source_type === 'youtube_reference')
    ?? workspace?.assets.find(asset => asset.kind === 'video') ?? null;
  const reviewConcepts = (workspace?.twin.evaluated.concept_results ?? [])
    .filter(result => result.total > result.correct)
    .map(result => ({ concept: concepts.find(concept => concept.id === result.concept_id), result }))
    .filter((item): item is { concept: ConceptNode; result: typeof item.result } => Boolean(item.concept));
  return {
    objectives,
    knowledge,
    outline,
    evidence,
    edges: (workspace?.edges ?? []).filter(edge => conceptIds.has(edge.source) && conceptIds.has(edge.target)),
    primaryVideo,
    canTrackVideo: Boolean(primaryVideo && primaryVideo.source_type !== 'youtube_reference'),
    reviewConcepts,
  };
}
