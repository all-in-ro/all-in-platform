// Image changes require a personal grant, never a shop-wide module default.
const schemas = new WeakMap();
const txt = value => String(value ?? '').trim();

export async function ensureAifImagePermissions(pool) {
  if (!schemas.has(pool)) {
    const pending = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS aif_shop_user_modules (
        code_id text PRIMARY KEY, shop_id text NOT NULL,
        enabled_modules text[] NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(), updated_by text NULL
      )`);
      await pool.query(`ALTER TABLE aif_shop_user_modules
        ADD COLUMN IF NOT EXISTS can_manage_images boolean NOT NULL DEFAULT false`);
    })().catch(error => { schemas.delete(pool); throw error; });
    schemas.set(pool, pending);
  }
  return schemas.get(pool);
}

export async function getAifImagePermission(pool, session) {
  if (session?.role === 'admin') return { canManageImages: true, needsLogin: false };
  if (session?.role !== 'shop') return { canManageImages: false, needsLogin: false };
  // Old sessions have only an actor name. Names are not a secure identity.
  const codeId = txt(session.codeId);
  const shopId = txt(session.shopId || session.shop_id);
  if (!codeId || !shopId) return { canManageImages: false, needsLogin: true };
  await ensureAifImagePermissions(pool);
  const result = await pool.query(`SELECT p.can_manage_images
    FROM login_codes c
    LEFT JOIN aif_shop_user_modules p ON p.code_id=c.id::text AND p.shop_id=c.shop_id
    WHERE c.id::text=$1 AND c.shop_id=$2 AND c.revoked_at IS NULL
      AND (c.expires_at IS NULL OR c.expires_at>now())`, [codeId, shopId]);
  return { canManageImages: result.rows[0]?.can_manage_images === true, needsLogin: false };
}

export function requireAifImagePermission(pool) {
  return async (req, res, next) => {
    try {
      const permission = await getAifImagePermission(pool, req.session);
      if (!permission.canManageImages) return res.status(403).json({
        error: permission.needsLogin
          ? 'A képszerkesztéshez jelentkezz ki, majd lépj be újra a saját kódoddal.'
          : 'Nincs engedélyed a termékképek feltöltésére vagy módosítására. Kérd az adminisztrátortól.',
        code: permission.needsLogin ? 'image_permission_login_required' : 'image_permission_denied',
      });
      next();
    } catch (error) {
      console.error('AIF image permission check failed', { message: error?.message });
      return res.status(503).json({ error: 'A képszerkesztési jogosultság nem ellenőrizhető. Próbáld újra.', code: 'image_permission_unavailable' });
    }
  };
}
