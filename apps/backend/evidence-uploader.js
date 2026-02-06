/**
 * Evidence Uploader - Worker v5.1
 *
 * Uploads evidence screenshots to Supabase Storage
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

class EvidenceUploader {
  constructor(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Key are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.bucketName = 'device-evidence';
  }

  /**
   * Ensure storage bucket exists
   */
  async ensureBucketExists() {
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets();

      if (error) {
        throw error;
      }

      const bucketExists = buckets.some(b => b.name === this.bucketName);

      if (!bucketExists) {
        console.log(`[Upload] Creating bucket: ${this.bucketName}`);

        const { data, error: createError } = await this.supabase.storage.createBucket(
          this.bucketName,
          {
            public: true,
            fileSizeLimit: 5242880 // 5MB
          }
        );

        if (createError) {
          throw createError;
        }

        console.log(`[Upload] ✅ Bucket created: ${this.bucketName}`);
      }

    } catch (error) {
      console.warn(`[Upload] Bucket check failed: ${error.message}`);
      // Continue anyway, bucket might exist but list failed
    }
  }

  /**
   * Upload screenshot to Supabase Storage
   */
  async uploadScreenshot(localPath, deviceId, jobId) {
    try {
      // Verify file exists
      if (!fs.existsSync(localPath)) {
        throw new Error(`File not found: ${localPath}`);
      }

      const fileSize = fs.statSync(localPath).size;
      console.log(`[Upload] Uploading ${localPath} (${(fileSize / 1024).toFixed(1)} KB)`);

      // Read file buffer
      const fileBuffer = fs.readFileSync(localPath);

      // Upload path: evidence/DEVICE_ID/JOB_ID.png
      const storagePath = `evidence/${deviceId}/${jobId}.png`;

      console.log(`[Upload] Storage path: ${storagePath}`);

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true // Overwrite if exists
        });

      if (error) {
        throw error;
      }

      console.log(`[Upload] ✅ Upload complete`);

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      console.log(`[Upload] Public URL: ${publicUrl}`);

      // Clean up local file
      try {
        fs.unlinkSync(localPath);
        console.log(`[Upload] Local file deleted: ${localPath}`);
      } catch (cleanupError) {
        console.warn(`[Upload] Cleanup warning: ${cleanupError.message}`);
      }

      return publicUrl;

    } catch (error) {
      console.error(`[Upload] Failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update job assignment with screenshot URL
   */
  async updateJobAssignment(assignmentId, screenshotUrl) {
    try {
      console.log(`[Upload] Updating assignment ${assignmentId} with screenshot URL`);

      const { error } = await this.supabase
        .from('job_assignments')
        .update({ screenshot_url: screenshotUrl })
        .eq('id', assignmentId);

      if (error) {
        throw error;
      }

      console.log(`[Upload] ✅ Assignment updated`);
      return true;

    } catch (error) {
      console.error(`[Upload] Assignment update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Complete flow: Upload + Update DB
   */
  async processEvidence(localPath, deviceId, jobId, assignmentId) {
    try {
      // Ensure bucket exists
      await this.ensureBucketExists();

      // Upload screenshot
      const screenshotUrl = await this.uploadScreenshot(localPath, deviceId, jobId);

      // Update job assignment
      await this.updateJobAssignment(assignmentId, screenshotUrl);

      console.log(`[Upload] ✅ Evidence processing complete`);

      return screenshotUrl;

    } catch (error) {
      console.error(`[Upload] Evidence processing failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EvidenceUploader;
