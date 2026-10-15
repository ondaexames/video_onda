async function handleStaffManagement(request, url, db, staffSession) {
  if (request.method === "POST" && url.pathname === "/api/staff/password") {
    const body = await readJson(request) || {};
    const current = await db.prepare("SELECT * FROM staff_users WHERE id = ?").bind(staffSession.id).first();
    if (!await verifyPassword(String(body.currentPassword || ""), current)) return responseJson({ error: "A senha atual não confere" }, 400);
    if (!validPassword(body.newPassword)) return responseJson({ error: "A nova senha deve ter pelo menos 8 caracteres" }, 400);
    const credentials = await createPassword(body.newPassword);
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE staff_users SET password_salt = ?, password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?").bind(credentials.salt, credentials.hash, now, staffSession.id).run();
    return responseJson({ ok: true, reauthenticate: true });
  }
  if (url.pathname !== "/api/staff-users" && !url.pathname.startsWith("/api/staff-users/")) return null;
  if (staffSession.role !== "admin") return responseJson({ error: "Somente administradores podem gerenciar a equipe" }, 403);
  if (request.method === "GET" && url.pathname === "/api/staff-users") {
    const result = await db.prepare("SELECT * FROM staff_users ORDER BY active DESC, name ASC").all();
    return responseJson({ users: (result.results || []).map(publicStaff) });
  }
  if (request.method === "POST" && url.pathname === "/api/staff-users") {
    const body = await readJson(request) || {};
    const name = cleanName(body.name), email = normalizeEmail(body.email);
    const role = ["admin", "veterinarian", "reception"].includes(body.role) ? body.role : "reception";
    if (name.length < 2 || !validEmail(email)) return responseJson({ error: "Informe nome e e-mail válidos" }, 400);
    if (!validPassword(body.password)) return responseJson({ error: "A senha temporária deve ter pelo menos 8 caracteres" }, 400);
    if (await db.prepare("SELECT id FROM staff_users WHERE email = ?").bind(email).first()) return responseJson({ error: "Já existe uma conta com este e-mail" }, 409);
    const credentials = await createPassword(body.password), now = Math.floor(Date.now() / 1000), id = randomToken(12);
    await db.prepare("INSERT INTO staff_users (id,name,email,password_salt,password_hash,role,crmv,unit_name,active,must_change_password,token_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,1,1,?,?)").bind(id,name,email,credentials.salt,credentials.hash,role,cleanName(body.crmv),cleanName(body.unitName,"Gravataí"),now,now).run();
    return responseJson({ ok: true, user: publicStaff(await db.prepare("SELECT * FROM staff_users WHERE id = ?").bind(id).first()) }, 201);
  }
  const resetMatch = url.pathname.match(/^\/api\/staff-users\/([^/]+)\/reset-password$/);
  if (request.method === "POST" && resetMatch) {
    const body = await readJson(request) || {}, targetId = decodeURIComponent(resetMatch[1]);
    if (!validPassword(body.newPassword)) return responseJson({ error: "A senha temporária deve ter pelo menos 8 caracteres" }, 400);
    if (!await db.prepare("SELECT id FROM staff_users WHERE id = ?").bind(targetId).first()) return responseJson({ error: "Usuário não encontrado" }, 404);
    const credentials = await createPassword(body.newPassword), now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE staff_users SET password_salt=?, password_hash=?, must_change_password=1, token_version=token_version+1, updated_at=? WHERE id=?").bind(credentials.salt,credentials.hash,now,targetId).run();
    return responseJson({ ok: true });
  }
  const userMatch = url.pathname.match(/^\/api\/staff-users\/([^/]+)$/);
  if (request.method === "PATCH" && userMatch) {
    const body = await readJson(request) || {}, targetId = decodeURIComponent(userMatch[1]);
    const current = await db.prepare("SELECT * FROM staff_users WHERE id=?").bind(targetId).first();
    if (!current) return responseJson({ error: "Usuário não encontrado" }, 404);
    const name=cleanName(body.name,current.name), email=normalizeEmail(body.email||current.email), role=["admin","veterinarian","reception"].includes(body.role)?body.role:current.role, active=body.active===undefined?Number(current.active):(body.active?1:0);
    if (current.role === "admin" && (role !== "admin" || !active)) { const count=await db.prepare("SELECT COUNT(*) AS total FROM staff_users WHERE role='admin' AND active=1").first(); if(Number(count?.total||0)<=1) return responseJson({ error: "Mantenha pelo menos um administrador ativo" },409); }
    if (await db.prepare("SELECT id FROM staff_users WHERE email=? AND id!=?").bind(email,targetId).first()) return responseJson({ error: "Já existe uma conta com este e-mail" },409);
    const accessChanged=role!==current.role||active!==Number(current.active), now=Math.floor(Date.now()/1000);
    await db.prepare("UPDATE staff_users SET name=?,email=?,role=?,crmv=?,unit_name=?,active=?,token_version=token_version+?,updated_at=? WHERE id=?").bind(name,email,role,cleanName(body.crmv),cleanName(body.unitName,"Gravataí"),active,accessChanged?1:0,now,targetId).run();
    return responseJson({ ok:true,user:publicStaff(await db.prepare("SELECT * FROM staff_users WHERE id=?").bind(targetId).first()) });
  }
  return responseJson({ error: "Rota de equipe não encontrada" }, 404);
}
