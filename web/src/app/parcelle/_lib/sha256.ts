// Empreinte SHA-256 d'un fichier, calculee dans le navigateur : le PDF de
// l'attestation n'est jamais envoye au serveur.
export async function sha256File(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
