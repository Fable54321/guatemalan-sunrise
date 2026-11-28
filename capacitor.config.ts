import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.vegibec.recruitment",
  appName: "Recrutement Vegibec",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
}

export default config
