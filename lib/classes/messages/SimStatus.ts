// This file has been automatically generated by writeMessageClasses.js

import * as Long from 'long';
import { MessageFlags } from '../../enums/MessageFlags';
import { MessageBase } from '../MessageBase';
import { Message } from '../../enums/Message';

export class SimStatusMessage implements MessageBase
{
    name = 'SimStatus';
    messageFlags = MessageFlags.Trusted | MessageFlags.FrequencyMedium;
    id = Message.SimStatus;

    SimStatus: {
        CanAcceptAgents: boolean;
        CanAcceptTasks: boolean;
    };
    SimFlags: {
        Flags: Long;
    };

    getSize(): number
    {
        return 10;
    }

    // @ts-ignore
    writeToBuffer(buf: Buffer, pos: number): number
    {
        const startPos = pos;
        buf.writeUInt8((this.SimStatus['CanAcceptAgents']) ? 1 : 0, pos++);
        buf.writeUInt8((this.SimStatus['CanAcceptTasks']) ? 1 : 0, pos++);
        buf.writeInt32LE(this.SimFlags['Flags'].low, pos);
        pos += 4;
        buf.writeInt32LE(this.SimFlags['Flags'].high, pos);
        pos += 4;
        return pos - startPos;
    }

    // @ts-ignore
    readFromBuffer(buf: Buffer, pos: number): number
    {
        const startPos = pos;
        const newObjSimStatus: {
            CanAcceptAgents: boolean,
            CanAcceptTasks: boolean
        } = {
            CanAcceptAgents: false,
            CanAcceptTasks: false
        };
        newObjSimStatus['CanAcceptAgents'] = (buf.readUInt8(pos++) === 1);
        newObjSimStatus['CanAcceptTasks'] = (buf.readUInt8(pos++) === 1);
        this.SimStatus = newObjSimStatus;
        const newObjSimFlags: {
            Flags: Long
        } = {
            Flags: Long.ZERO
        };
        newObjSimFlags['Flags'] = new Long(buf.readInt32LE(pos), buf.readInt32LE(pos + 4));
        pos += 8;
        this.SimFlags = newObjSimFlags;
        return pos - startPos;
    }
}

