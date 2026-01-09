import { Client, Databases, ID, Query } from 'appwrite';

export const APPWRITE_CONFIG = {
    endpoint: "https://tor.cloud.appwrite.io/v1",
    projectId: "6921d1250036b4841242",
    databaseId: "6921d17f0022f5f0cf10",
    dsrCollectionId: "dsr_reports",
    userPlansCollectionId: "user_plans", // Ensure this collection exists in your Appwrite console
    sentEmailsCollectionId: "sent_emails", // Replace with your actual Collection ID for Sent Emails
};

export const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);

export const databases = new Databases(client);
export { ID, Query };

