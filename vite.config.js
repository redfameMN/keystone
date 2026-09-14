import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// BASE_PATH is set by the Pages workflow ("/keystone/"); local dev serves from "/".
export default defineConfig({ plugins: [react()], base: process.env.BASE_PATH ?? "/" });
