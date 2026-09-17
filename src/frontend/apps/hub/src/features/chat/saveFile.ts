/** Hands a file to the browser as a download. */
export const saveFile = (blob: Blob, fileName: string) => {
  const href = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  // Some browsers read the link after the click handler returns.
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
};
