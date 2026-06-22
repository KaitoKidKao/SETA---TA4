export function generatePseudoEmbedding(text: string): number[] {
  const dimensions = 1536;
  const vector = new Array<number>(dimensions).fill(0);

  if (!text || !text.trim()) {
    vector[0] = 1;
    return vector;
  }

  // Tokenize and lowercase
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (words.length === 0) {
    vector[0] = 1;
    return vector;
  }

  // FNV-1a 32-bit hash function
  function fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // Populate vector based on token hashes
  for (const word of words) {
    const hash = fnv1a(word);
    const index = hash % dimensions;
    const current = vector[index] ?? 0;
    vector[index] = current + 1.0;
  }

  // L2 Normalization (make it a unit vector)
  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    const val = vector[i] ?? 0;
    sumSq += val * val;
  }

  const magnitude = Math.sqrt(sumSq);
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      const val = vector[i] ?? 0;
      vector[i] = val / magnitude;
    }
  } else {
    vector[0] = 1;
  }

  return vector;
}

export function generatePseudoEmbeddings(texts: string[]): number[][] {
  return texts.map(generatePseudoEmbedding);
}
