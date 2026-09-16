import { useMutation } from "@tanstack/react-query";

import { fetchAPI } from "@/features/api/fetchApi";
import { login } from "@/features/auth/Auth";

export type CreatedDocsDocument = {
  id: string;
  provider: "docs";
  title: string;
  address: string;
  sharing: {
    shared: string[];
    unresolved: string[];
    failed: string[];
  };
};

export const createDocsDocument = async (
  title: string,
  memberIds: string[],
): Promise<CreatedDocsDocument> => {
  try {
    const response = await fetchAPI(
      "integrations/docs/documents/",
      {
        method: "POST",
        body: JSON.stringify({ title, member_ids: memberIds }),
      },
      { redirectOn40x: false },
    );
    return (await response.json()) as CreatedDocsDocument;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 401
    ) {
      login(window.location.href);
    }
    throw error;
  }
};

export const useCreateDocsDocument = () => {
  const mutation = useMutation<
    CreatedDocsDocument,
    Error,
    { title: string; memberIds: string[] }
  >({
    mutationFn: ({ title, memberIds }) => createDocsDocument(title, memberIds),
    meta: { noGlobalError: true },
  });

  return {
    createDocument: mutation.mutateAsync,
    isCreating: mutation.isPending,
  };
};
