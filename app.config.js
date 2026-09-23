module.exports = ({ config }) => {
  return {
    ...config,
    runtimeVersion: "1.0.0",
    updates: {
      url: process.env.UPDATES_URL || "http://192.168.29.129:4000/api/manifest",
      enabled: true,
      checkAutomatically: "NEVER"
    }
  };
};
