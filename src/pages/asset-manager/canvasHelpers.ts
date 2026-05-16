// Convert Google Drive sharing links to directly embeddable URLs
export function toDirectUrl(url: string): string {
  if (!url) return url;
  const ghBlob = url.match(/https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/);
  if (ghBlob) return `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}`;
  return url;
}
