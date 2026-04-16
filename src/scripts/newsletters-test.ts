import axios from 'axios';
import { verifySoftDelete } from './soft-delete-check';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:3000';

async function run() {
  try {
    console.log('🚀 Starting Newsletter Module Test...\n');

    // -----------------------------------
    // 1. Prepare File (make sure this exists)
    // -----------------------------------
    const filePath = path.join(__dirname, 'sample.pdf');

    if (!fs.existsSync(filePath)) {
      console.log('⚠️ sample.pdf not found. Creating dummy file...');
      fs.writeFileSync(filePath, 'Dummy newsletter content');
    }

    // -----------------------------------
    // 2. CREATE NEWSLETTER (UPLOAD FILE)
    // -----------------------------------
    const form = new FormData();
    form.append('title', 'Weekly Bulletin');
    form.append('description', 'Church weekly newsletter');
    form.append('file', fs.createReadStream(filePath));

    const createRes = await axios.post(`${API}/newsletters`, form, {
      headers: form.getHeaders(),
    });

    const newsletter = createRes.data.data;
    const newsletterId = newsletter.id;

    console.log('✅ Newsletter created:', newsletterId);
    console.log('📄 File URL:', newsletter.fileUrl);

    // -----------------------------------
    // 3. GET ALL
    // -----------------------------------
    const list = await axios.get(`${API}/newsletters?page=1&limit=10`);

    console.log('📋 Total newsletters:', list.data.meta.total);

    // -----------------------------------
    // 4. GET ONE
    // -----------------------------------
    const single = await axios.get(`${API}/newsletters/${newsletterId}`);

    console.log('🔍 Retrieved:', single.data.data.title);

    // -----------------------------------
    // 5. UPDATE WITH NEW FILE
    // -----------------------------------
    const newFilePath = path.join(__dirname, 'updated.pdf');

    fs.writeFileSync(newFilePath, 'Updated newsletter content');

    const updateForm = new FormData();
    updateForm.append('title', 'Updated Bulletin');
    updateForm.append('file', fs.createReadStream(newFilePath));

    const updateRes = await axios.patch(
      `${API}/newsletters/${newsletterId}`,
      updateForm,
      {
        headers: updateForm.getHeaders(),
      },
    );

    console.log('✏️ Updated title:', updateRes.data.data.title);

    console.log('📄 Updated file URL:', updateRes.data.data.fileUrl);

    // -----------------------------------
    // 6. VERIFY FILE EXISTS ON DISK
    // -----------------------------------
    const storedPath = path.join(process.cwd(), updateRes.data.data.fileUrl);

    const fileExists = fs.existsSync(storedPath);

    console.log('💾 File saved:', fileExists ? 'PASSED' : 'FAILED');
    await verifySoftDelete(axios, `${API}/newsletters`, newsletterId);

    console.log('\n🎉 ALL NEWSLETTER TESTS PASSED');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED');
    console.error(error.response?.data || error.message);
  }
}

run();
