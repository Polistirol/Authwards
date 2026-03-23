export type IotaAuthConfig = {
  backendUrl: string;
};

export type User = {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  did: string;
  didDocument: unknown;
};

export type Agent = {
  agentDid: string;
  ownerDid: string;
  permissionProfile: string;
  createdAt: string;
  active: boolean;
};

export type AgentLog = {
  agentDid: string;
  timestamp: string;
  type: string;
  data: unknown;
};
