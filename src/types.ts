export interface GetTokenResponse {
  token: string;
}

export interface GetSessionResponse {
  session: {
    name: string;
    key: string;
    subscriber: string;
  }
}

export interface ScrobbleResponse {
  scrobbles: {
    '@attr': {
      accepted: number | string;
      ignored: number | string;
    };
    scrobble: unknown;
  };
  error?: number;
  message?: string;
}

export interface ErrorResponse {
  error: number;
  message: string;
}
