import { createClient } from "@insforge/sdk";

const insforge = createClient({
  baseUrl: 'https://5papp5aj.eu-central.insforge.app',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNDUwNDR9.HlrQ3klD2Kk0AkfipDR30dw5lVExLni76cS_p3LAL68'
});

async function run() {
  const { data, error } = await insforge.database.from('roadmaps').select('*').order('created_at', { ascending: false });
  console.log("Data:", data ? data.length : "None");
  console.log("Error:", error);
}
run();
