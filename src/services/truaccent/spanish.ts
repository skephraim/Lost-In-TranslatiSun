/** Spanish orthography helpers shared by the scorer. */

const STRONG_VOWELS = new Set(["a", "e", "o", "á", "é", "ó"]);
const WEAK_VOWELS = new Set(["i", "u", "ü"]);
const ACCENTED_WEAK = new Set(["í", "ú"]);
const ALL_VOWELS = new Set([...STRONG_VOWELS, ...WEAK_VOWELS, ...ACCENTED_WEAK]);

export function isVowel(ch: string): boolean {
  return ALL_VOWELS.has(ch.toLowerCase());
}

/** Strips diacritics and punctuation, lowercases, collapses whitespace. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function words(text: string): string[] {
  const n = normalize(text);
  return n.length ? n.split(" ") : [];
}

/**
 * Counts syllables by vowel nuclei. Within a run of adjacent vowels, a new
 * syllable starts at each hiatus: between two strong vowels, or at an
 * accented weak vowel (which breaks an otherwise-diphthong, as in "día").
 * An approximation, but Spanish is regular enough that it holds for the
 * vocabulary at these CEFR levels.
 */
export function countSyllables(phrase: string): number {
  let total = 0;

  for (const word of phrase.toLowerCase().split(/\s+/).filter(Boolean)) {
    const letters = [...word].filter((c) => /\p{L}/u.test(c));
    let i = 0;
    let wordSyllables = 0;

    while (i < letters.length) {
      if (!isVowel(letters[i])) {
        i += 1;
        continue;
      }
      // Walk the whole vowel run, counting hiatus breaks inside it.
      let runSyllables = 1;
      let prev = letters[i];
      i += 1;
      while (i < letters.length && isVowel(letters[i])) {
        const current = letters[i];
        const bothStrong = STRONG_VOWELS.has(prev) && STRONG_VOWELS.has(current);
        const accentedWeak = ACCENTED_WEAK.has(current) || ACCENTED_WEAK.has(prev);
        if (bothStrong || accentedWeak) runSyllables += 1;
        prev = current;
        i += 1;
      }
      wordSyllables += runSyllables;
    }

    // A word with no vowel letters still takes a beat to say.
    total += Math.max(wordSyllables, 1);
  }

  return total;
}

/** Levenshtein distance over arbitrary token arrays. */
export function editDistance<T>(a: T[], b: T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length];
}

export interface WordPair {
  expected?: string;
  heard?: string;
}

/**
 * Aligns expected against heard words so substitutions can be inspected
 * individually. Standard Levenshtein backtrace; insertions and deletions
 * come back as pairs with one side missing.
 */
export function alignWords(expected: string[], heard: string[]): WordPair[] {
  const rows = expected.length;
  const cols = heard.length;
  const table: number[][] = Array.from({ length: rows + 1 }, (_, i) =>
    Array.from({ length: cols + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      const cost = expected[i - 1] === heard[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
    }
  }

  const pairs: WordPair[] = [];
  let i = rows;
  let j = cols;

  while (i > 0 || j > 0) {
    const cost = i > 0 && j > 0 && expected[i - 1] === heard[j - 1] ? 0 : 1;
    if (i > 0 && j > 0 && table[i][j] === table[i - 1][j - 1] + cost) {
      pairs.push({ expected: expected[i - 1], heard: heard[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && table[i][j] === table[i - 1][j] + 1) {
      pairs.push({ expected: expected[i - 1] });
      i -= 1;
    } else {
      pairs.push({ heard: heard[j - 1] });
      j -= 1;
    }
  }

  return pairs.reverse();
}
