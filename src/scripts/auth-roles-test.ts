import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Auth + Roles Test...\n');

    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        baseURL: API,
        withCredentials: true,
        jar,
      }),
    );

    // -----------------------------------
    // 1. CREATE ROLES
    // -----------------------------------
    const roles = ['ADMIN', 'LEADER', 'MEMBER'];
    const roleMap: Record<string, string> = {};

    for (const name of roles) {
      try {
        const res = await client.post('/roles', { name });
        roleMap[name] = res.data.data.id;
        console.log(`✅ Role created: ${name}`);
      } catch (err: any) {
        // If already exists, fetch all and map
        const all = await client.get('/roles');
        const found = all.data.data.find((r: any) => r.name === name);
        if (found) {
          roleMap[name] = found.id;
          console.log(`ℹ️ Role exists: ${name}`);
        }
      }
    }

    // -----------------------------------
    // 2. REGISTER USER
    // -----------------------------------
    const email = `user${Date.now()}@test.com`;

    const register = await client.post('/auth/register', {
      email,
      password: 'password123',
    });

    const userId = register.data.data.id;

    console.log('✅ User registered:', email);

    // -----------------------------------
    // 3. LOGIN (SET COOKIE)
    // -----------------------------------
    await client.post('/auth/login', {
      email,
      password: 'password123',
    });

    console.log('🔐 Logged in (cookie active)');

    // -----------------------------------
    // 4. TRY ACCESS ADMIN ROUTE (SHOULD FAIL)
    // -----------------------------------
    try {
      await client.post(`/auth/assign-role/${userId}/${roleMap.ADMIN}`);
      console.log('❌ RBAC FAIL: Unauthorized access allowed');
    } catch {
      console.log('✅ RBAC working: access denied (expected)');
    }

    // -----------------------------------
    // 5. MANUALLY ASSIGN ADMIN ROLE (SIMULATE ADMIN)
    // -----------------------------------
    console.log('⚠️ Simulating admin role assignment...');

    // ⚠️ This requires one ADMIN user already in DB
    // If none exists, temporarily disable RBAC on this endpoint or seed DB manually

    // For now, assume you manually assign ADMIN in DB or via Prisma Studio

    // -----------------------------------
    // 6. LOGIN AGAIN (REFRESH TOKEN)
    // -----------------------------------
    await client.post('/auth/login', {
      email,
      password: 'password123',
    });

    console.log('🔐 Re-login after role assignment');

    // -----------------------------------
    // 7. TEST ADMIN ACCESS
    // -----------------------------------
    try {
      await client.post(`/auth/assign-role/${userId}/${roleMap.LEADER}`);
      console.log('✅ RBAC PASS: Admin access granted');
    } catch {
      console.log('❌ RBAC FAIL: Admin should have access');
    }

    // -----------------------------------
    // 8. GET CURRENT USER
    // -----------------------------------
    const me = await client.get('/auth/me');

    console.log('👤 Current user roles:', me.data.data.roles);

    // -----------------------------------
    // 9. LOGOUT
    // -----------------------------------
    await client.post('/auth/logout');

    console.log('🚪 Logged out');

    // -----------------------------------
    // 10. VERIFY SESSION CLEARED
    // -----------------------------------
    try {
      await client.get('/auth/me');
      console.log('❌ Session still active');
    } catch {
      console.log('✅ Session cleared');
    }

    console.log('\n🎉 ALL AUTH + ROLES TESTS COMPLETED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
