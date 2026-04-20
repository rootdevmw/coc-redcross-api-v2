export type ExtractedMedia = {
  url: string;
  type: 'image' | 'video' | 'audio';
};

export function extractMediaUrls(html: string): ExtractedMedia[] {
  const results: ExtractedMedia[] = [];

  if (!html) return results;

  const patterns = [
    { regex: /<img[^>]+src="([^">]+)"/g, type: 'image' },
    { regex: /<video[^>]+src="([^">]+)"/g, type: 'video' },
    { regex: /<audio[^>]+src="([^">]+)"/g, type: 'audio' },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(html))) {
      results.push({ url: match[1], type: type as any });
    }
  }

  return results;
}
