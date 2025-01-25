// Source: https://github.com/hgourvest/node-firebird/blob/master/lib/firebird.msg.json
export const FirebirdConnectionErrors = {
  "335544324": "Invalid database handle (no active connection)",
  "335544365": "Request referenced an unavailable database",
  "335544375": "Unavailable database",
  "335544421": "Connection rejected by remote interface",
  "335544648": "Connection lost to pipe server",
  "335544721": "Unable to complete network request to host",
  "335544722": "Failed to establish a connection",
  "335544723": "Error while listening for an incoming connection",
  "335544724": "Failed to establish a secondary connection for event processing",
  "335544725": "Error while listening for an incoming event connection request",
  "335544726": "Error reading data from the connection",
  "335544727": "Error writing data to the connection",
  "335544741": "Connection lost to database",
  "335544856": "Connection shutdown"
}

export function isFirebirdConnectionError(error) {
  if (!error) {
    return false
  }

  if (error instanceof Error || typeof error === "object") {
    if (String(error?.code) in FirebirdConnectionErrors) {
      return true
    }
  }

  const msg = String(error)
  return Object.values(FirebirdConnectionErrors).some(err => msg.includes(err))
}
