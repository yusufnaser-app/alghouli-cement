import { useState } from 'react';
import Branding from './Branding';
import Providers from './Providers';

export default function Settings() {
  const [tab, setTab] = useState('branding');

  return (
    <div>
      <div className="tabs">
        <button
          className={`tab ${tab === 'branding' ? 'active' : ''}`}
          onClick={() => setTab('branding')}
        >
          🎨 الهوية والشعارات
        </button>
        <button
          className={`tab ${tab === 'providers' ? 'active' : ''}`}
          onClick={() => setTab('providers')}
        >
          🔌 مزودو الخدمة
        </button>
      </div>

      <div className="tab-content">
        {tab === 'branding' && <Branding />}
        {tab === 'providers' && <Providers />}
      </div>
    </div>
  );
}
