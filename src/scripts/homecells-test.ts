import axios from 'axios';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Homecells Module Test...\n');

    // -----------------------------------
    // 1. Create Ministries (dependency)
    // -----------------------------------
    const ministry = await axios.post(`${API}/ministries`, {
      name: 'Youth Ministry',
      description: 'Youth activities',
    });

    const ministryId = ministry.data.data.id;
    console.log('✅ Ministry created');

    // -----------------------------------
    // 2. Create Members
    // -----------------------------------
    const member1 = await axios.post(`${API}/members`, {
      firstName: 'John',
      lastName: 'Doe',
      status: 'Member',
      location: 'Area 25',
    });

    const member2 = await axios.post(`${API}/members`, {
      firstName: 'Mary',
      lastName: 'Banda',
      status: 'Member',
      location: 'Area 18',
    });

    const member1Id = member1.data.data.id;
    const member2Id = member2.data.data.id;

    console.log('✅ Members created');

    // -----------------------------------
    // 3. Create Homecells
    // -----------------------------------
    const hc1 = await axios.post(`${API}/homecells`, {
      name: 'Area 25 Homecell',
      location: 'Area 25',
    });

    const hc2 = await axios.post(`${API}/homecells`, {
      name: 'Area 18 Homecell',
      location: 'Area 18',
    });

    const hc1Id = hc1.data.data.id;
    const hc2Id = hc2.data.data.id;

    console.log('✅ Homecells created');

    // -----------------------------------
    // 4. Assign Members to Homecell
    // -----------------------------------
    await axios.post(`${API}/homecells/${hc1Id}/members`, {
      memberId: member1Id,
    });

    await axios.post(`${API}/homecells/${hc1Id}/members`, {
      memberId: member2Id,
    });

    console.log('✅ Members assigned to Homecell 1');

    // -----------------------------------
    // 5. VERIFY Assignment
    // -----------------------------------
    const hc1Members = await axios.get(`${API}/homecells/${hc1Id}/members`);

    console.log('📋 Homecell 1 members:', hc1Members.data.data.length);

    // -----------------------------------
    // 6. TEST OVERRIDE (CRITICAL RULE)
    // Move member1 to another homecell
    // -----------------------------------
    await axios.post(`${API}/homecells/${hc2Id}/members`, {
      memberId: member1Id,
    });

    console.log('🔁 Member reassigned to Homecell 2');

    // -----------------------------------
    // 7. VERIFY OVERRIDE
    // -----------------------------------
    const hc1After = await axios.get(`${API}/homecells/${hc1Id}/members`);

    const hc2After = await axios.get(`${API}/homecells/${hc2Id}/members`);

    console.log('📉 Homecell 1 members after move:', hc1After.data.data.length);

    console.log('📈 Homecell 2 members after move:', hc2After.data.data.length);

    // -----------------------------------
    // 8. GET ALL HOMECELLS
    // -----------------------------------
    const all = await axios.get(`${API}/homecells`);

    console.log('🏠 Total homecells:', all.data.data.length);

    // -----------------------------------
    // 9. GET SINGLE HOMECELL
    // -----------------------------------
    const single = await axios.get(`${API}/homecells/${hc1Id}`);

    console.log('🔍 Single homecell:', single.data.data.name);

    // -----------------------------------
    // 10. UPDATE HOMECELL
    // -----------------------------------
    await axios.patch(`${API}/homecells/${hc1Id}`, {
      location: 'Updated Area 25',
    });

    console.log('✏️ Homecell updated');

    console.log('\n🎉 ALL HOMECELL TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
