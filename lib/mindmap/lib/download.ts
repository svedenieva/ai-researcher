/** Trigger a browser download from a Blob; cleans up the object URL. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // 1 s buffer: Safari/some download managers read the URL asynchronously
  // after `a.click()`; revoking synchronously can abort the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Trigger a browser download from an existing URL. */
export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
