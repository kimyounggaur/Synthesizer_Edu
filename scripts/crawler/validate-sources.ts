import { loadSources } from './lib/source-loader';

const sources = await loadSources();
const active = sources.filter((source) => source.status === 'active');
const blocked = sources.filter((source) => source.status === 'blocked');

console.log(
  `소스 정의 ${sources.length}개 검증 완료 (active ${active.length}, blocked ${blocked.length})`,
);
for (const source of sources) {
  const hostCount = new Set([...source.hosts.base, ...source.hosts.assets]).size;
  console.log(
    `- ${source.id}: ${source.status}, archetype ${source.archetype}, hosts ${hostCount}`,
  );
}
