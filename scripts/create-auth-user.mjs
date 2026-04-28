import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);

const getArg = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
};

const hasFlag = (name) => args.includes(`--${name}`);

const email = getArg('email');
const password = getArg('password');
const role = getArg('role') ?? 'pharmacy_user';
const fullName = getArg('full-name') ?? 'Utilisateur';
const pharmacyName = getArg('pharmacy-name');
const autoConfirm = hasFlag('auto-confirm');

if (!email || !password) {
  console.error('Usage: node scripts/create-auth-user.mjs --email <email> --password <password> --role <admin|pharmacy_user> [--full-name "Nom"] [--pharmacy-name "Pharmacie"] [--auto-confirm]');
  process.exit(1);
}

if (role !== 'admin' && role !== 'pharmacy_user') {
  console.error('Le rôle doit être admin ou pharmacy_user.');
  process.exit(1);
}

if (role === 'pharmacy_user' && !pharmacyName) {
  console.error('Le paramètre --pharmacy-name est requis pour pharmacy_user.');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: autoConfirm,
  user_metadata: {
    full_name: fullName,
    role,
    ...(role === 'pharmacy_user' ? { pharmacy_name: pharmacyName } : {}),
  },
});

if (createError || !created.user) {
  console.error('Echec création auth user:', createError?.message ?? 'unknown');
  process.exit(1);
}

let pharmacyId = null;

if (role === 'pharmacy_user') {
  const { data: pharmacy, error: pharmacyError } = await supabase
    .from('pharmacies')
    .insert({
      name: pharmacyName,
      email,
    })
    .select('id')
    .single();

  if (pharmacyError) {
    console.error('User créé mais échec création pharmacie:', pharmacyError.message);
    process.exit(1);
  }

  pharmacyId = pharmacy.id;
}

const { error: profileError } = await supabase
  .from('profiles')
  .upsert({
    id: created.user.id,
    full_name: fullName,
    role,
    pharmacy_id: pharmacyId,
  });

if (profileError) {
  console.error('User créé mais échec création profile:', profileError.message);
  process.exit(1);
}

console.log('Utilisateur créé:', {
  id: created.user.id,
  email: created.user.email,
  role,
  pharmacy_id: pharmacyId,
  email_confirmed: autoConfirm,
});
