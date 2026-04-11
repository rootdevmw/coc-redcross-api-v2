import axios from 'axios';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Content Module Test...\n');

    // -----------------------------------
    // 1. Create Content Type (EXPOSED)
    // -----------------------------------
    const type = await axios.post(`${API}/content/types`, {
      name: 'Sermon',
    });

    const typeId = type.data.data.id;
    console.log('✅ Content type created:', typeId);

    // -----------------------------------
    // 2. Create Author (Member)
    // -----------------------------------
    const member = await axios.post(`${API}/members`, {
      firstName: 'Pastor',
      lastName: 'John',
      status: 'Member',
      location: 'Lilongwe',
    });

    const authorId = member.data.data.id;
    console.log('✅ Author created:', authorId);

    // -----------------------------------
    // 3. Create Content (Tags are INTERNAL)
    // -----------------------------------
    const content = await axios.post(`${API}/content`, {
      title: 'Faith in Difficult Times',
      body: 'This is a powerful sermon about faith...',
      typeId,
      authorId,

      // 🔥 Tags are just names now
      tags: ['Faith', 'Salvation', 'Hope'],

      scriptures: [
        {
          book: 'Hebrews',
          chapter: 11,
          verseFrom: 1,
          verseTo: 3,
        },
        {
          book: 'Romans',
          chapter: 10,
          verseFrom: 17,
        },
      ],
    });

    const contentId = content.data.data.id;
    console.log('✅ Content created:', contentId);

    // -----------------------------------
    // 4. Get All Content
    // -----------------------------------
    const list = await axios.get(`${API}/content?page=1&limit=10`);

    console.log('📋 Content count:', list.data.data.length);

    // -----------------------------------
    // 5. Get Single Content
    // -----------------------------------
    const single = await axios.get(`${API}/content/${contentId}`);

    console.log('🔍 Content title:', single.data.data.title);
    console.log(
      '🏷️ Tags:',
      single.data.data.tags.map((t: any) => t.tag.name),
    );

    // -----------------------------------
    // 6. Update Content
    // -----------------------------------
    await axios.patch(`${API}/content/${contentId}`, {
      title: 'Updated Faith Message',
      body: 'Updated sermon content...',
    });

    console.log('✏️ Content updated');

    // -----------------------------------
    // 7. Publish Content
    // -----------------------------------
    await axios.post(`${API}/content/${contentId}/publish`, {
      status: 'Published',
    });

    console.log('📢 Content published');

    // -----------------------------------
    // 8. Filter by Status
    // -----------------------------------
    const published = await axios.get(`${API}/content?status=Published`);

    console.log('📂 Published content:', published.data.data.length);

    // -----------------------------------
    // 9. Search Content
    // -----------------------------------
    const search = await axios.get(`${API}/content?search=Faith`);

    console.log('🔎 Search results:', search.data.data.length);

    // -----------------------------------
    // 10. Get Content Types
    // -----------------------------------
    const types = await axios.get(`${API}/content/types`);

    console.log('📚 Content types:', types.data.data.length);

    console.log('\n🎉 ALL CONTENT TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
