import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

const blocked = () => { throw new Error('Network access is forbidden in the offline demo test'); };
http.request = http.get = https.request = https.get = blocked;
net.connect = net.createConnection = blocked;
net.Socket.prototype.connect = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();
