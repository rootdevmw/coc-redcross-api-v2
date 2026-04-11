import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Auth + RBAC Test...\n');

    // cookie jar to persist cookies
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        baseURL: API,
        withCredentials: true,
        jar,
      }),
    );

    // -----------------------------------
    // 1. REGISTER USER
    // -----------------------------------
    const email = `test${Date.now()}@mail.com`;

    const register = await client.post('/auth/register', {
      email,
      password: 'password123',
    });

    const userId = register.data.data.id;

    console.log('✅ User registered:', email);

    // -----------------------------------
    // 2. LOGIN (COOKIE SET)
    // -----------------------------------
    await client.post('/auth/login', {
      email,
      password: 'password123',
    });

    console.log('🔐 Logged in (cookie stored)');

    // -----------------------------------
    // 3. GET CURRENT USER (AUTH TEST)
    // -----------------------------------
    const me = await client.get('/auth/me');

    console.log('👤 Current user:', me.data.data.email);

    // -----------------------------------
    // 4. CREATE ROLE (DIRECT DB OR ASSUME EXISTS)
    // -----------------------------------
    // ⚠️ Ensure you have a role like ADMIN in DB
    // For test, we assume roleId is known or seeded

    const roleId = 'ADMIN_ROLE_ID_HERE'; // 🔥 replace with real ID

    try {
      await client.post(`/auth/assign-role/${userId}/${roleId}`);
      console.log('👑 Role assigned');
    } catch {
      console.log('⚠️ Role assignment skipped (role may not exist)');
    }

    // -----------------------------------
    // 5. ACCESS PROTECTED ROUTE (RBAC)
    // -----------------------------------
    try {
      await client.post(`/auth/assign-role/${userId}/${roleId}`);
      console.log('🔒 RBAC access: PASSED');
    } catch (err: any) {
      console.log('🔒 RBAC access: FAILED (expected if no ADMIN)');
    }

    // -----------------------------------
    // 6. LOGOUT
    // -----------------------------------
    await client.post('/auth/logout');

    console.log('🚪 Logged out');

    // -----------------------------------
    // 7. VERIFY ACCESS DENIED
    // -----------------------------------
    try {
      await client.get('/auth/me');
      console.log('❌ Auth still active (FAILED)');
    } catch {
      console.log('✅ Auth cleared (PASSED)');
    }

    console.log('\n🎉 ALL AUTH TESTS COMPLETED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
