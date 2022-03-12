import * as  matcher from 'matcher';

function buildIncludeExcludeMatcher(includePatterns?: string[], excludePatterns?: string[]): (text: string | null | undefined) => boolean {
  const matchPatterns = new Array<string[]>();

  const include = (includePatterns ?? []).filter(x => x != null && x.length > 0);
  const exclude = (excludePatterns ?? []).filter(x => x != null && x.length > 0);
  const allExcludes = exclude.map(p => `!${p}`);
  if (include.length === 0) {
    matchPatterns.push(allExcludes);
  } else {
    for (const inc of include) {
      matchPatterns.push([inc, ...allExcludes]);
    }
  }

  return  function (text: string | null | undefined): boolean {
    if (!text) {
      return false;
    }
    if (matchPatterns.length === 0) {
      return true;
    }
    for (const patterns of matchPatterns) {
      if (matcher.isMatch(text, patterns)) {
        return true;    // matched by any include and all excludes
      }
    }
    return false;
  };
}

export default buildIncludeExcludeMatcher;
export { buildIncludeExcludeMatcher };
