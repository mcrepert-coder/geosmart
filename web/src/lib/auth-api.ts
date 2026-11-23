const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";
export const AUTH_API_CONFIGURED = API_URL !== "";

function apiErrorMessage(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("message" in result)) {
    return undefined;
  }
  const message = result.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(" ");
  }
  return undefined;
}

async function postAuth<T>(endpoint: string, body: object): Promise<T> {
  if (!API_URL) {
    throw new Error("Le service de comptes n’est pas configuré.");
  }

  const response = await fetch(`${API_URL}/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      apiErrorMessage(result) ??
        "La demande a échoué. Vérifiez les informations et réessayez.",
    );
  }
  if (result === null || typeof result !== "object") {
    throw new Error("Réponse inattendue du service de comptes.");
  }
  return result as T;
}

type AccountResponse = {
  status?: string;
};

export async function registerAccount(phone: string, password: string): Promise<void> {
  const account = await postAuth<AccountResponse>("registrations", { phone, password });
  if (account.status !== "TELEPHONE_NON_VERIFIE") {
    throw new Error("Le service n’a pas confirmé la création du compte.");
  }
}

export async function verifyAccountPhone(phone: string, code: string): Promise<void> {
  const account = await postAuth<AccountResponse>("phone-verifications", { phone, code });
  if (account.status !== "EN_ATTENTE") {
    throw new Error("Le service n’a pas confirmé la vérification du téléphone.");
  }
}
