/**
 * Thin fetch wrapper. All requests go to /api/* which Vite proxies to Express on :4000.
 * Credentials: "include" ensures the httpOnly cookie is sent on every request.
 */

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = await res.json().catch(() => ({ error: "Invalid JSON response" }));

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed: ${res.status}`);
  }

  return data as T;
}

// Strip Content-Type for multipart/form-data (browser sets boundary automatically)
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const data = await res.json().catch(() => ({ error: "Invalid JSON response" }));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Upload failed: ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
};

export { ApiError };
