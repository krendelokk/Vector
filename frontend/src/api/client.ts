import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../store/auth';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

/**
 * Окремий клієнт для анонімних звернень: без токена, без cookies.
 * Сервер у такому запиті фізично не отримує нічого, що ідентифікує користувача.
 */
export const anonymousApi = axios.create({ baseURL: '/api', withCredentials: false });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

export async function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((res) => {
        useAuth.getState().setSession(res.data.accessToken, res.data.user);
        return res.data.accessToken as string;
      })
      .catch((e: AxiosError) => {
        // Вихід лише тоді, коли сервер сказав, що сесії немає (401).
        // Тимчасова помилка (мережа, 429, 5xx) не повинна викидати користувача.
        if (e.response?.status === 401) useAuth.getState().clear();
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

// Access-токен живе 15 хвилин: при 401 один раз оновлюємо його через refresh-cookie
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';
    if (error.response?.status === 401 && original && !original._retry && !url.startsWith('/auth/')) {
      original._retry = true;
      const token = await refreshSession();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Текст помилки з відповіді NestJS (message може бути рядком або масивом). */
export function errorMessage(e: unknown, fallback = 'Сталася помилка. Спробуйте ще раз.'): string {
  const err = e as AxiosError<{ message?: string | string[] }>;
  if (err?.response?.status === 429) return 'Забагато спроб. Зачекайте хвилину.';
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  return msg || fallback;
}

/** Завантаження файлу із захищеного ендпоінту (з токеном). */
export async function downloadFile(url: string, fallbackName = 'file') {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}
