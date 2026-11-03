import { Chess } from 'chess.js';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, getPlayerUid } from './firebase';

export type Room = {
  id: string;
  code: string;
  fen: string;
  pgn?: string;
  whiteUid: string;
  blackUid: string | null;
  status: 'waiting' | 'playing' | 'finished';
  updatedAt?: unknown;
};

function database() {
  if (!db) throw new Error('Firebase is not configured. Add your Firebase settings first.');
  return db;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function createRoom() {
  const firestore = database();
  const uid = await getPlayerUid();
  const code = newCode();
  const roomRef = doc(collection(firestore, 'games'));
  await runTransaction(firestore, async (transaction) => {
    transaction.set(roomRef, {
      code,
      fen: new Chess().fen(),
      pgn: '',
      whiteUid: uid,
      blackUid: null,
      status: 'waiting',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return { id: roomRef.id, code, color: 'w' as const };
}

export async function joinRoom(inputCode: string) {
  const firestore = database();
  const uid = await getPlayerUid();
  const code = inputCode.trim().toUpperCase();
  const matches = await getDocs(query(collection(firestore, 'games'), where('code', '==', code)));
  if (matches.empty) throw new Error('We could not find that invite code. Check it and try again.');
  const roomRef = matches.docs[0].ref;
  const result = await runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('That game no longer exists.');
    const room = snapshot.data() as Omit<Room, 'id'>;
    if (room.whiteUid === uid) return { id: roomRef.id, code, color: 'w' as const };
    if (room.blackUid && room.blackUid !== uid) throw new Error('That game already has two players.');
    if (room.status === 'finished') throw new Error('That game has already ended.');
    transaction.update(roomRef, { blackUid: uid, status: 'playing', updatedAt: serverTimestamp() });
    return { id: roomRef.id, code, color: 'b' as const };
  });
  return result;
}

export async function playRoomMove(roomId: string, from: string, to: string, promotion = 'q') {
  const firestore = database();
  const uid = await getPlayerUid();
  const roomRef = doc(firestore, 'games', roomId);
  return runTransaction(firestore, async (transaction) => {
    const snapshot = await transaction.get(roomRef);
    if (!snapshot.exists()) throw new Error('This game could not be found.');
    const room = snapshot.data() as Omit<Room, 'id'>;
    const chess = new Chess(room.fen);
    const activeUid = chess.turn() === 'w' ? room.whiteUid : room.blackUid;
    if (activeUid !== uid) throw new Error('It is not your turn.');
    if (room.status !== 'playing') throw new Error('Wait for another player to join.');
    const move = chess.move({ from, to, promotion });
    if (!move) throw new Error('That is not a legal move.');
    transaction.update(roomRef, {
      fen: chess.fen(),
      pgn: chess.pgn(),
      status: chess.isGameOver() ? 'finished' : room.status,
      updatedAt: serverTimestamp(),
    });
    return chess.fen();
  });
}

export function watchRoom(roomId: string, onChange: (room: Room | null) => void, onError: (error: Error) => void): Unsubscribe {
  const firestore = database();
  return onSnapshot(doc(firestore, 'games', roomId), (snapshot) => {
    onChange(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Room) : null);
  }, onError);
}
