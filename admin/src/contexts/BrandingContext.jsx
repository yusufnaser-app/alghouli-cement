import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const DEFAULT_BRANDING = {
  primary_color: '#1a3a5c',
  secondary_color: '#d4a574',
  logo_url: '',
  favicon_url: '',
  login_image_url: '',
  home_banner_url: '',
  company_name: 'مؤسسة الغولي',
};

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING,
  refresh: () => {},
});

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(() => {
    // محاولة قراءة من localStorage أولًا (سريع)
    try {
      const cached = localStorage.getItem('branding_cache');
      if (cached) return { ...DEFAULT_BRANDING, ...JSON.parse(cached) };
    } catch {}
    return DEFAULT_BRANDING;
  });

  const applyToCSS = (b) => {
    const root = document.documentElement;
    root.style.setProperty('--primary', b.primary_color);
    root.style.setProperty('--secondary', b.secondary_color);
    root.style.setProperty('--primary-light', lighten(b.primary_color, 40));
    root.style.setProperty('--primary-dark', darken(b.primary_color, 15));
  };

  const refresh = async () => {
    try {
      const res = await api.brandingPublic();
      const data = { ...DEFAULT_BRANDING, ...(res.data.data || {}) };
      setBranding(data);
      applyToCSS(data);
      localStorage.setItem('branding_cache', JSON.stringify(data));
      document.title = data.company_name || 'مؤسسة الغولي';

      // favicon
      if (data.favicon_url) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = data.favicon_url;
      }
    } catch (e) {
      console.warn('تعذّر تحميل الهوية:', e.message);
    }
  };

  useEffect(() => {
    applyToCSS(branding);
    refresh();
    // eslint-disable-next-line
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, refresh, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);

// ═══ Helpers ═══
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
function lighten(hex, p) {
  const [r, g, b] = hexToRgb(hex);
  const f = p / 100;
  const R = Math.round(r + (255 - r) * f);
  const G = Math.round(g + (255 - g) * f);
  const B = Math.round(b + (255 - b) * f);
  return `#${[R, G, B].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}
function darken(hex, p) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - p / 100;
  const R = Math.round(r * f);
  const G = Math.round(g * f);
  const B = Math.round(b * f);
  return `#${[R, G, B].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}
