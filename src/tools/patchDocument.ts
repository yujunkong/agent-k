/**
 * SearchReplaceParser - 검색-교체 패치 문서 파서
 * 
 * 각 hunk: oldText(정확히 한 군데 일치) → newText로 교체
 * fuzzy fallback: 공백/들여쓰기 차이 허용
 */
export interface SearchReplaceHunk {
  oldText: string;
  newText: string;
}

export interface PatchResult {
  success: boolean;
  modified: boolean;
  hunksApplied: number;
  hunksFailed: number;
  failedHunks: Array<{ index: number; error: string }>;
  resultContent: string;
}

// Normalize whitespace for fuzzy matching
function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Compute similarity (simple Dice coefficient on word level)
function wordSimilarity(a: string, b: string): number {
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  if (wordsA.length === 0 && wordsB.length === 0) return 1.0;
  
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

function findBestMatch(content: string, oldText: string): { startIndex: number; endIndex: number; exact: boolean } | null {
  // 1. Exact match
  const exactIndex = content.indexOf(oldText);
  if (exactIndex !== -1) {
    return { startIndex: exactIndex, endIndex: exactIndex + oldText.length, exact: true };
  }

  // 2. Fuzzy match - try partial matching
  const normalizedContent = normalizeWhitespace(content);
  const normalizedNeedle = normalizeWhitespace(oldText);

  // Try normalized exact match
  const normIndex = normalizedContent.indexOf(normalizedNeedle);
  if (normIndex !== -1) {
    // Map back to original content by finding the actual line
    const contentBefore = content.slice(0, content.length);
    const lines = contentBefore.split('\n');
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const normalizedLine = normalizeWhitespace(lines[i]);
      if (charCount + normalizedLine.length >= normIndex) {
        // Found approximate location
        const fuzzyResult = findFuzzyMatch(content, oldText, charCount);
        if (fuzzyResult) return fuzzyResult;
      }
      charCount += lines[i].length + 1;
    }
  }

  // 3. Sliding window fuzzy match
  return findFuzzyMatch(content, oldText);
}

function findFuzzyMatch(content: string, oldText: string, hintIndex?: number): { startIndex: number; endIndex: number; exact: boolean } | null {
  const targetLines = oldText.split('\n');
  const contentLines = content.split('\n');
  const searchStart = hintIndex !== undefined ? content.slice(0, hintIndex).split('\n').length : 0;
  
  let bestScore = 0.5; // threshold
  let bestStart = -1;

  for (let i = searchStart; i <= contentLines.length - targetLines.length; i++) {
    const windowLines = contentLines.slice(i, i + targetLines.length);
    const windowText = windowLines.join('\n');
    const score = wordSimilarity(windowText, oldText);
    
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  if (bestStart === -1) return null;

  const startChar = contentLines.slice(0, bestStart).join('\n').length + (bestStart > 0 ? 1 : 0);
  const matchedText = contentLines.slice(bestStart, bestStart + targetLines.length).join('\n');
  
  return {
    startIndex: startChar,
    endIndex: startChar + matchedText.length,
    exact: false
  };
}

export function applySearchReplace(
  content: string,
  hunks: SearchReplaceHunk[],
  exactOnly = false
): PatchResult {
  const result: PatchResult = {
    success: true,
    modified: false,
    hunksApplied: 0,
    hunksFailed: 0,
    failedHunks: [],
    resultContent: content
  };

  let currentContent = content;

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    
    // Check for multiple matches (exact)
    const firstMatch = currentContent.indexOf(hunk.oldText);
    const secondMatch = currentContent.indexOf(hunk.oldText, firstMatch + 1);
    
    if (firstMatch === -1) {
      // No exact match - try fuzzy
      if (exactOnly) {
        result.hunksFailed++;
        result.failedHunks.push({ index: i, error: `No exact match found for hunk ${i}` });
        continue;
      }

      const fuzzyMatch = findBestMatch(currentContent, hunk.oldText);
      if (!fuzzyMatch) {
        result.hunksFailed++;
        result.failedHunks.push({ index: i, error: `No match (even fuzzy) for hunk ${i}` });
        continue;
      }

      // Apply fuzzy match
      currentContent = currentContent.slice(0, fuzzyMatch.startIndex) + hunk.newText + currentContent.slice(fuzzyMatch.endIndex);
      result.hunksApplied++;
      result.modified = true;
    } else if (secondMatch !== -1) {
      // Multiple matches - try narrowing
      result.hunksFailed++;
      result.failedHunks.push({ index: i, error: `Multiple exact matches (${firstMatch}, ${secondMatch}) for hunk ${i}. Provide more surrounding context.` });
    } else {
      // Single exact match - apply
      currentContent = currentContent.slice(0, firstMatch) + hunk.newText + currentContent.slice(firstMatch + hunk.oldText.length);
      result.hunksApplied++;
      result.modified = true;
    }
  }

  result.success = result.hunksFailed === 0;
  result.resultContent = currentContent;
  return result;
}

/**
 * 주어진 content에서 oldText의 유일한 위치를 검증
 */
export function validateHunk(content: string, oldText: string): { valid: boolean; count: number; message: string } {
  let count = 0;
  let idx = -1;
  while ((idx = content.indexOf(oldText, idx + 1)) !== -1) {
    count++;
    if (count > 1) break;
  }

  if (count === 0) {
    return { valid: false, count: 0, message: 'No match found. Try with more surrounding context.' };
  }
  if (count > 1) {
    return { valid: false, count, message: `${count} matches found. Provide more context to make the match unique.` };
  }
  return { valid: true, count: 1, message: 'Unique match found.' };
}
