import axios from 'axios';
import { verifySoftDelete } from './soft-delete-check';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Members Module Test...\n');

    // -------------------------------
    // 1. Create Homecell
    // -------------------------------
    const homecell = await axios.post(`${API}/homecells`, {
      name: 'Lilongwe Central',
      location: 'Area 3',
    });

    const homecellId = homecell.data.data.id;
    console.log('✅ Homecell created:', homecellId);

    // -------------------------------
    // 2. Create Ministries
    // -------------------------------
    const ministry1 = await axios.post(`${API}/ministries`, {
      name: 'Choir',
      description: 'Music ministry',
    });

    const ministry2 = await axios.post(`${API}/ministries`, {
      name: 'Media',
      description: 'Tech ministry',
    });

    const ministry1Id = ministry1.data.data.id;
    const ministry2Id = ministry2.data.data.id;

    console.log('✅ Ministries created');

    // -------------------------------
    // 3. Create Member
    // -------------------------------
    const member = await axios.post(`${API}/members`, {
      firstName: 'John',
      lastName: 'Doe',
      phone: '0991234567',
      status: 'Member',
      location: 'Area 25',
      homecellId,
    });

    const memberId = member.data.data.id;
    console.log('✅ Member created:', memberId);

    // -------------------------------
    // 4. Assign Ministries
    // -------------------------------
    await axios.post(`${API}/members/${memberId}/ministries`, {
      ministryId: ministry1Id,
    });

    await axios.post(`${API}/members/${memberId}/ministries`, {
      ministryId: ministry2Id,
    });

    console.log('✅ Member assigned to ministries');

    // -------------------------------
    // 5. Get All Members
    // -------------------------------
    const members = await axios.get(`${API}/members?page=1&limit=10`);
    console.log('📋 Members list:', members.data.data.length);

    // -------------------------------
    // 6. Get Single Member
    // -------------------------------
    const single = await axios.get(`${API}/members/${memberId}`);
    console.log('🔍 Single member:', single.data.data.firstName);

    // -------------------------------
    // 7. Update Member
    // -------------------------------
    await axios.patch(`${API}/members/${memberId}`, {
      phone: '0887654321',
    });

    console.log('✏️ Member updated');

    // -------------------------------
    // 8. Remove Ministry
    // -------------------------------
    await axios.delete(`${API}/members/${memberId}/ministries/${ministry1Id}`);

    console.log('🗑️ Removed ministry');

    // -------------------------------
    // 9. Filter Members
    // -------------------------------
    const filtered = await axios.get(
      `${API}/members?search=John&status=Member`,
    );

    console.log('🔎 Filtered results:', filtered.data.data.length);
    await verifySoftDelete(axios, `${API}/members`, memberId);

    console.log('\n🎉 ALL TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
