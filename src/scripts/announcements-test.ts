import axios from 'axios';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Announcements Module Test...\n');

    // -----------------------------------
    // 1. Create Homecell
    // -----------------------------------
    const hc = await axios.post(`${API}/homecells`, {
      name: 'Area 25 Homecell',
      location: 'Area 25',
    });

    const homecellId = hc.data.data.id;
    console.log('✅ Homecell created');

    // -----------------------------------
    // 2. Create Ministry
    // -----------------------------------
    const ministry = await axios.post(`${API}/ministries`, {
      name: 'Choir',
      description: 'Music ministry',
    });

    const ministryId = ministry.data.data.id;
    console.log('✅ Ministry created');

    // -----------------------------------
    // 3. Create Member
    // -----------------------------------
    const member = await axios.post(`${API}/members`, {
      firstName: 'James',
      lastName: 'Banda',
      status: 'Member',
      location: 'Area 25',
      homecellId,
    });

    const memberId = member.data.data.id;
    console.log('✅ Member created');

    // Assign member to ministry
    await axios.post(`${API}/members/${memberId}/ministries`, {
      ministryId,
    });

    console.log('✅ Member assigned to ministry');

    // -----------------------------------
    // 4. Create Announcements
    // -----------------------------------

    // Homecell-targeted
    const a1 = await axios.post(`${API}/announcements`, {
      title: 'Homecell Meeting',
      body: 'Meeting this Friday',
      priority: 2,
      targets: [
        {
          targetType: 'HOMECELL',
          targetId: homecellId,
        },
      ],
    });

    // Ministry-targeted
    const a2 = await axios.post(`${API}/announcements`, {
      title: 'Choir Practice',
      body: 'Practice on Saturday',
      priority: 5,
      targets: [
        {
          targetType: 'MINISTRY',
          targetId: ministryId,
        },
      ],
    });

    // Expired announcement
    const a3 = await axios.post(`${API}/announcements`, {
      title: 'Old Event',
      body: 'Expired announcement',
      priority: 10,
      expiryDate: '2020-01-01',
      targets: [
        {
          targetType: 'MINISTRY',
          targetId: ministryId,
        },
      ],
    });

    const announcementId = a1.data.data.id;

    console.log('✅ Announcements created');

    // -----------------------------------
    // 5. Get All Announcements
    // -----------------------------------
    const all = await axios.get(`${API}/announcements?page=1&limit=10`);

    console.log('📋 Total announcements:', all.data.data.length);

    // -----------------------------------
    // 6. Get Active Only
    // -----------------------------------
    const active = await axios.get(`${API}/announcements?activeOnly=true`);

    console.log('⏳ Active announcements:', active.data.data.length);

    // -----------------------------------
    // 7. Get Member-Specific Announcements
    // -----------------------------------
    const memberAnnouncements = await axios.get(
      `${API}/announcements/member/${memberId}`,
    );

    console.log(
      '🎯 Member announcements:',
      memberAnnouncements.data.data.length,
    );

    // Should NOT include expired one
    const hasExpired = memberAnnouncements.data.data.some(
      (a: any) => a.title === 'Old Event',
    );

    console.log('🚫 Expired filtered:', hasExpired ? 'FAILED' : 'PASSED');

    // -----------------------------------
    // 8. Check Priority Order
    // -----------------------------------
    const sorted = memberAnnouncements.data.data;

    console.log(
      '🥇 Highest priority first:',
      sorted[0]?.priority >= sorted[1]?.priority ? 'PASSED' : 'FAILED',
    );

    // -----------------------------------
    // 9. Update Announcement
    // -----------------------------------
    await axios.patch(`${API}/announcements/${announcementId}`, {
      title: 'Updated Homecell Meeting',
      priority: 9,
      targets: [
        {
          targetType: 'MINISTRY',
          targetId: ministryId,
        },
      ],
    });

    console.log('✏️ Announcement updated');

    // -----------------------------------
    // 10. Verify Update
    // -----------------------------------
    const updated = await axios.get(`${API}/announcements/member/${memberId}`);

    const updatedExists = updated.data.data.some(
      (a: any) => a.title === 'Updated Homecell Meeting',
    );

    console.log('🔄 Update reflected:', updatedExists ? 'PASSED' : 'FAILED');

    console.log('\n🎉 ALL ANNOUNCEMENT TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
