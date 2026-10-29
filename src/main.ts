import './styles.css';
import { DEMO, getSyncStatus, subscribe, syncNow } from './data/store';
import { isConnected } from './data/connection';
import { renderSetup } from './screens/setup';
import { renderBudget } from './screens/budget';
import { renderEntry } from './screens/entry';
import { renderHousehold } from './screens/household';
import { renderBusiness } from './screens/business';
import { renderFixed } from './screens/fixed';
import { renderFixedEdit } from './screens/fixedEdit';
import { renderDebt } from './screens/debt';
import { renderDebtEdit } from './screens/debtEdit';
import { renderInstallment } from './screens/installment';
import { renderSettings } from './screens/settings';
import { renderBankEdit, renderCardEdit, renderCards } from './screens/cards';
import { renderClientEdit, renderClients } from './screens/clients';
import { renderProjects } from './screens/projects';

// URL の # 以降で画面を切り替える（例: #/budget, #/debt/d1）

const root = document.getElementById('app')!;

function route() {
  // 公開版は、URL と合言葉が入るまで中身を一切表示しない
  if (!DEMO && !isConnected()) return renderSetup(root, route);
  const [page = 'budget', a, b] = location.hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'entry':
      return renderEntry(root);
    case 'household':
      return renderHousehold(root);
    case 'business':
      return renderBusiness(root);
    case 'fixed':
      return a === 'edit' ? renderFixedEdit(root, b) : renderFixed(root);
    case 'debt':
      if (a === 'edit') return renderDebtEdit(root, b);
      if (a === 'installment') return renderInstallment(root);
      return renderDebt(root, a);
    case 'settings':
      if (a === 'cards') return renderCards(root);
      if (a === 'card') return renderCardEdit(root, b);
      if (a === 'bank') return renderBankEdit(root, b);
      if (a === 'clients') return renderClients(root);
      if (a === 'client') return renderClientEdit(root, b);
      if (a === 'projects') return renderProjects(root);
      return renderSettings(root);
    default:
      return renderBudget(root);
  }
}

let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  route();
  if (location.hash !== lastHash) window.scrollTo(0, 0);
  lastHash = location.hash;
});
subscribe(route);
route();

// つながっていれば、開いたとき・電波が戻ったとき・アプリに戻ってきたときにスプレッドシートと同期する
if (isConnected()) void syncNow();
window.addEventListener('online', () => void syncNow());
document.addEventListener('visibilitychange', () => {
  const last = getSyncStatus().lastSync;
  if (document.visibilityState === 'visible' && (!last || Date.now() - new Date(last).getTime() > 60_000)) void syncNow();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
