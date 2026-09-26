import axios from 'axios';

const TOKEN_KEY = 'sadeia.token';

export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* sin almacenamiento */ }
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 });

api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) onUnauthorized();
    return Promise.reject(err);
  }
);

/** Mensaje legible de un error de la API. */
export const errMsg = (e) => e?.response?.data?.error || e?.message || 'Error de comunicación con el servidor';

/** Descarga un archivo binario devuelto por la API. */
export async function download(url, body, fallbackName, method = 'post') {
  const r = method === 'get' ? await api.get(url, { responseType: 'blob' }) : await api.post(url, body, { responseType: 'blob' });
  const cd = r.headers['content-disposition'] || '';
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
  const href = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
