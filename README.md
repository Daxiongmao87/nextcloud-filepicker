# Nextcloud FilePicker Module for Foundry VTT
![badge_version] ![badge_issues] ![badge_downloads]
![badge_fvtt_versions]
![Screenshot](https://github.com/Daxiongmao87/nextcloud-filepicker/blob/main/images/nextcloud-filepicker-screenshot.png)
## Introduction

**Nextcloud FilePicker** is a module for Foundry Virtual Tabletop that integrates with Nextcloud, allowing users to access and manage their Nextcloud files directly within Foundry VTT. This module enhances the virtual tabletop experience by providing seamless access to a wide range of cloud-stored assets.

***BE AWARE**: This module will create public links for files you use from your Nextcloud instance to your Foundry VTT server, this is so your other players will be able to view your file during the session.*

## Key Features

    - Nextcloud Integration: Configure and connect to your Nextcloud server directly from Foundry VTT.
    - File Management: Browse, upload, and select files from your Nextcloud storage without leaving Foundry VTT.
    - Subdirectory Filtering: Make Nextcloud FilePicker only view a user-defined subdirectory within your nextcloud data structure.
    - Enhanced File Picker: Custom file picker extension tailored for Nextcloud, improving the user interface and experience.

## Todo (Not Implemented)

    - Bulk Upload Support
    - Public Link Expiration/Revocation
    - Copy/Move/Deletion functionality

## Requirements

    1. Nextcloud Instance: Users must have a Nextcloud instance installed and running.
    2. WebAppPassword App: Install the WebAppPassword app on the Nextcloud instance and configure the domain fields to include your Foundry VTT server's domain. This app is essential for generating temporary app passwords and enabling WebDAV access for SPAs, which is a key requirement for this module. This application facilitates SPA integration with Nextcloud by providing enhanced WebDAV access.  Please visit [WebAppPassword Nextcloud Page](https://apps.nextcloud.com/apps/webapppassword) for more information about this application
    3. Web Server Configuration for CORS:
        - Nginx/Apache: Your web server (Nginx or Apache) must be configured to handle CORS requests, particularly with the 'OPTIONS' request method. This involves setting the 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers', and 'Access-Control-Allow-Credentials' headers appropriately to allow communication between Foundry VTT and Nextcloud.
        - Specific Instructions: Refer to the provided Nginx and Apache configuration examples in the "Understanding CORS Issues" section for details on setting up CORS on your server.

### Web Server Configuration Examples

#### Nginx
```javascript
location / {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' '*';
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
        # Add any other required headers for your setup
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Access-Control-Allow-Credentials' 'true';
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        add_header 'Content-Length' 0;
        return 204;
    }
    # Existing Nginx configuration here
}
```

#### Apache

```xml
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    # Add any other required headers for your setup
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    Header always set Access-Control-Allow-Credentials "true"
</IfModule>
```

### Understanding CORS Issues

Nextcloud has inherent limitations in handling CORS (Cross-Origin Resource Sharing) requests, as discussed in this [GitHub issue](https://github.com/nextcloud/server/pull/40537)

To effectively use the Nextcloud FilePicker module in Foundry VTT, understanding and addressing these CORS limitations is critical.

In a standard setup, Nextcloud's CORS policy does not fully support the needs of SPAs like Foundry VTT, particularly for certain WebDAV operations. This is where the WebAppPassword app becomes essential. It provides a workaround by injecting the needed CORS headers for certain API calls. This allows Foundry VTT to interact with the Nextcloud server without being hindered by CORS restrictions.

The installation of the WebAppPassword app is not just a requirement but a fundamental workaround to the CORS limitations that Nextcloud has with SPAs until Nextcloud has its own solutions implemented. Without it, users may encounter issues when the Foundry VTT tries to access or manipulate files stored in Nextcloud.

## Usage

After installation, configure the module settings by entering your Nextcloud server details and App Password (Personal Settings -> Security -> Devices & Sessions -> Scroll to bottom of section). You can then access and manage your Nextcloud files directly through Foundry VTT's file browser.

[badge_version]: https://img.shields.io/github/v/tag/daxiongmao87/nextcloud-filepicker?label=Version&style=flat-square&color=2577a1
[badge_issues]: https://img.shields.io/github/issues/daxiongmao87/nextcloud-filepicker?style=flat-square
[badge_downloads]: https://img.shields.io/github/downloads/daxiongmao87/nextcloud-filepicker/total

[badge_fvtt_versions]: https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https://raw.githubusercontent.com/Daxiongmao87/nextcloud-filepicker/0.1.0/module.json&style=flat-square&color=ff6400


