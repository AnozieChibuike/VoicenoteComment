const cloudinary = require("cloudinary").v2;
const vscode = require("vscode");
const fs = require("fs");

class CloudinaryService {
  constructor() {
    this.configured = false;
  }

  getConfig() {
    const config = vscode.workspace.getConfiguration("voicenote.cloudinary");
    return {
      cloud_name: config.get("cloudName"),
      api_key: config.get("apiKey"),
      api_secret: config.get("apiSecret"),
      upload_preset: config.get("uploadPreset"),
    };
  }

  isConfigured() {
    const config = this.getConfig();
    return !!(config.cloud_name && config.api_key && config.api_secret);
  }

  configure() {
    const config = this.getConfig();
    if (this.isConfigured()) {
      cloudinary.config({
        cloud_name: config.cloud_name,
        api_key: config.api_key,
        api_secret: config.api_secret,
        secure: true,
      });
      this.configured = true;
      return true;
    }
    return false;
  }

  async uploadFile(filePath) {
    if (!this.configure()) {
      throw new Error(
        "Cloudinary is not configured. Please set your credentials in Settings."
      );
    }

    return new Promise((resolve, reject) => {
      const options = {
        resource_type: "auto",
        folder: "voicenotes",
      };

      // If upload preset is defined, use it
      const config = this.getConfig();
      if (config.upload_preset) {
        options.upload_preset = config.upload_preset;
      }

      cloudinary.uploader.upload(filePath, options, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      });
    });
  }
}

module.exports = CloudinaryService;
