import { startAccountsService } from '../accounts/service';
import { startValidatorService } from '../validator/service';
import { startExplorerService } from '../explorer/service';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  args.set(k, v);
}

const services = (args.get('services') ?? 'accounts,validator,explorer')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

(async () => {
  let accountsStore;
  let usersIndex;

  if (services.includes('accounts')) {
    const result = await startAccountsService(
      Number(args.get('accounts-port') ?? 7001)
    );
    accountsStore = result.accounts;
    usersIndex = result.users;
  }

  if (services.includes('validator') && accountsStore) {
    await startValidatorService(
      Number(args.get('validator-port') ?? 7002),
      accountsStore
    );
  }

  if (services.includes('explorer') && accountsStore && usersIndex) {
    await startExplorerService(
      Number(args.get('explorer-port') ?? 7003),
      accountsStore,
      usersIndex
    );
  }

  console.log('Services started:', services.join(', '));
})();
