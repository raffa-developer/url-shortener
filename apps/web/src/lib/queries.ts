import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keepPreviousData } from "@tanstack/react-query";
import {
  apiFetch,
  login as loginRequest,
  register as registerRequest,
  revokeRefreshToken,
} from "./api";
import { clearSession, getStoredRefreshToken, setSession } from "./auth-store";
import type {
  AnalyticsResponse,
  ApiKeyDTO,
  AuthSession,
  CreatedApiKey,
  LinkDTO,
  LinkPreview,
  LinkSort,
  LinkStatusFilter,
  PaginatedLinks,
  UpdateLinkInput,
} from "./types";

export interface CreateLinkInput {
  destinationUrl: string;
  customAlias?: string;
  expiresAt?: string | null;
}

export interface LinksQuery {
  page: number;
  pageSize: number;
  q?: string;
  status?: LinkStatusFilter;
  sort?: LinkSort;
}

export function useLinks(params: LinksQuery) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
  }
  const query = searchParams.toString();

  return useQuery({
    queryKey: ["links", query],
    queryFn: () => apiFetch<PaginatedLinks>(`/api/links?${query}`),
    // Keeps the previous page visible while typing or changing pages.
    placeholderData: keepPreviousData,
  });
}

export function useAnalytics(shortCode: string, days: number) {
  return useQuery({
    queryKey: ["analytics", shortCode, days],
    queryFn: () =>
      apiFetch<AnalyticsResponse>(
        `/api/links/${encodeURIComponent(shortCode)}/analytics?days=${days}`,
      ),
    enabled: shortCode.length > 0,
  });
}

export function useCreateLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLinkInput) =>
      apiFetch<LinkDTO>("/api/links", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });
}

export function useUpdateLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shortCode,
      input,
    }: {
      shortCode: string;
      input: UpdateLinkInput;
    }) =>
      apiFetch<LinkDTO>(`/api/links/${encodeURIComponent(shortCode)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: (_link, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["links"] });
      void queryClient.invalidateQueries({
        queryKey: ["analytics", variables.shortCode],
      });
      void queryClient.invalidateQueries({
        queryKey: ["preview", variables.shortCode],
      });
    },
  });
}

export function useDeleteLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shortCode: string) =>
      apiFetch<void>(`/api/links/${encodeURIComponent(shortCode)}`, {
        method: "DELETE",
      }),
    onSuccess: (_result, shortCode) => {
      void queryClient.invalidateQueries({ queryKey: ["links"] });
      queryClient.removeQueries({ queryKey: ["analytics", shortCode] });
      queryClient.removeQueries({ queryKey: ["preview", shortCode] });
    },
  });
}

export function useLinkPreview(shortCode: string) {
  return useQuery({
    queryKey: ["preview", shortCode],
    queryFn: () =>
      apiFetch<LinkPreview>(`/api/links/${encodeURIComponent(shortCode)}/preview`),
    enabled: shortCode.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<void>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuth: true,
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      apiFetch<void>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      }),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<void>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
        skipAuth: true,
      }),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      apiFetch<void>("/api/auth/resend-verification", { method: "POST" }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      loginRequest(email, password),
    onSuccess: (session: AuthSession) => setSession(session),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      registerRequest(email, password),
    onSuccess: (session: AuthSession) => setSession(session),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const refreshToken = getStoredRefreshToken();
      if (refreshToken) {
        try {
          await revokeRefreshToken(refreshToken);
        } catch {
          // Logging out locally matters more than revoking server-side.
        }
      }
    },
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch<{ data: ApiKeyDTO[] }>("/api/keys"),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<CreatedApiKey>("/api/keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
