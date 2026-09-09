import type { SourceAdapter, SourceDefinition } from '../types';
import { IndexHarvestAdapter } from './index-harvest';
import { JsonApiAdapter } from './json-api';
import { SearchFormAdapter } from './search-form';
import { StaticSlugAdapter } from './static-slug';

export function createAdapter(source: SourceDefinition): SourceAdapter {
  switch (source.archetype) {
    case 'A':
      return new StaticSlugAdapter(source);
    case 'B':
      return new IndexHarvestAdapter(source);
    case 'C':
      return new SearchFormAdapter(source);
    case 'D':
      return new JsonApiAdapter(source);
    case 'E':
      return new StaticSlugAdapter(source);
    case 'X':
      throw new Error(`${source.id} 소스는 검증 전이라 실행할 수 없습니다.`);
  }
}
