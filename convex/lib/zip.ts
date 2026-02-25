import JSZip from "jszip";

/**
 * Create a zip archive from an array of files.
 * Works in both browser and Convex V8 isolate environments.
 */
export async function createZipBlob(
  files: Array<{ path: string; content: Blob | ArrayBuffer | string }>,
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return await zip.generateAsync({ type: "blob" });
}
