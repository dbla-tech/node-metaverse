import { Circuit } from './Circuit';
import { ObjectUpdateMessage } from './messages/ObjectUpdate';
import { ObjectUpdateCachedMessage } from './messages/ObjectUpdateCached';
import { ObjectUpdateCompressedMessage } from './messages/ObjectUpdateCompressed';
import { ImprovedTerseObjectUpdateMessage } from './messages/ImprovedTerseObjectUpdate';
import { RequestMultipleObjectsMessage } from './messages/RequestMultipleObjects';
import { Agent } from './Agent';
import { UUID } from './UUID';
import { Quaternion } from './Quaternion';
import { Vector3 } from './Vector3';
import { Utils } from './Utils';
import { ClientEvents } from './ClientEvents';
import { IObjectStore } from './interfaces/IObjectStore';
import { RBush3D } from 'rbush-3d/dist';
import { Vector4 } from './Vector4';
import { TextureEntry } from './TextureEntry';
import { Color4 } from './Color4';
import { ParticleSystem } from './ParticleSystem';
import { GameObject } from './public/GameObject';
import { ObjectStoreLite } from './ObjectStoreLite';
import { TextureAnim } from './public/TextureAnim';
import { ExtraParams } from './public/ExtraParams';
import { CompressedFlags } from '../enums/CompressedFlags';
import { PCode } from '../enums/PCode';
import { BotOptionFlags } from '../enums/BotOptionFlags';

export class ObjectStoreFull extends ObjectStoreLite implements IObjectStore
{
    rtree?: RBush3D;

    constructor(circuit: Circuit, agent: Agent, clientEvents: ClientEvents, options: BotOptionFlags)
    {
        super(circuit, agent, clientEvents, options);
        this.rtree = new RBush3D();
    }

    protected objectUpdate(objectUpdate: ObjectUpdateMessage): void
    {
        for (const objData of objectUpdate.ObjectData)
        {
            const localID = objData.ID;
            const parentID = objData.ParentID;
            let addToParentList = true;
            let newObject = false;
            if (this.objects[localID])
            {
                if (this.objects[localID].ParentID !== parentID && this.objectsByParent[parentID])
                {
                    const ind = this.objectsByParent[parentID].indexOf(localID);
                    if (ind !== -1)
                    {
                        this.objectsByParent[parentID].splice(ind, 1);
                    }
                }
                else if (this.objectsByParent[parentID])
                {
                    addToParentList = false;
                }
            }
            else
            {
                newObject = true;
                this.objects[localID] = new GameObject();
                this.objects[localID].region = this.agent.currentRegion;
            }
            this.objects[localID].deleted = false;

            const obj = this.objects[localID];
            obj.ID = objData.ID;
            obj.State = objData.State;
            obj.FullID = objData.FullID;
            obj.CRC = objData.CRC;
            obj.PCode = objData.PCode;
            obj.Material = objData.Material;
            obj.ClickAction = objData.ClickAction;

            obj.Scale = objData.Scale;
            obj.setObjectData(objData.ObjectData);

            obj.ParentID = objData.ParentID;

            obj.Flags = objData.UpdateFlags;
            obj.PathCurve = objData.PathCurve;
            obj.ProfileCurve = objData.ProfileCurve;
            obj.PathBegin = Utils.unpackBeginCut(objData.PathBegin);
            obj.PathEnd = Utils.unpackEndCut(objData.PathEnd);
            obj.PathScaleX = Utils.unpackPathScale(objData.PathScaleX);
            obj.PathScaleY = Utils.unpackPathScale(objData.PathScaleY);
            obj.PathShearX = Utils.unpackPathShear(objData.PathShearX);
            obj.PathShearY = Utils.unpackPathShear(objData.PathShearY);
            obj.PathTwist = Utils.unpackPathTwist(objData.PathTwist);
            obj.PathTwistBegin = Utils.unpackPathTwist(objData.PathTwistBegin);
            obj.PathRadiusOffset = Utils.unpackPathTwist(objData.PathRadiusOffset);
            obj.PathTaperX = Utils.unpackPathTaper(objData.PathTaperX);
            obj.PathTaperY = Utils.unpackPathTaper(objData.PathTaperY);
            obj.PathRevolutions = Utils.unpackPathRevolutions(objData.PathRevolutions);
            obj.PathSkew = Utils.unpackPathTwist(objData.PathSkew);
            obj.ProfileBegin = Utils.unpackBeginCut(objData.ProfileBegin);
            obj.ProfileEnd = Utils.unpackEndCut(objData.ProfileEnd);
            obj.ProfileHollow = Utils.unpackProfileHollow(objData.ProfileHollow);
            obj.TextureEntry = TextureEntry.from(objData.TextureEntry);
            obj.textureAnim = TextureAnim.from(objData.TextureAnim);

            const pcodeData = objData.Data;
            obj.Text = Utils.BufferToStringSimple(objData.Text);
            obj.TextColor = new Color4(objData.TextColor, 0, false, true);
            obj.MediaURL = Utils.BufferToStringSimple(objData.MediaURL);
            obj.Particles = ParticleSystem.from(objData.PSBlock);
            obj.Sound = objData.Sound;
            obj.OwnerID = objData.OwnerID;
            obj.SoundGain = objData.Gain;
            obj.SoundFlags = objData.Flags;
            obj.SoundRadius = objData.Radius;
            obj.JointType = objData.JointType;
            obj.JointPivot = objData.JointPivot;
            obj.JointAxisOrAnchor = objData.JointAxisOrAnchor;

            switch (obj.PCode)
            {
                case PCode.Grass:
                case PCode.Tree:
                case PCode.NewTree:
                    if (pcodeData.length === 1)
                    {
                        obj.TreeSpecies = pcodeData[0];
                    }
                    break;
                case PCode.Prim:

                    break;
            }

            if (this.objects[localID].PCode === PCode.Avatar && this.objects[localID].FullID.toString() === this.agent.agentID.toString())
            {
                this.agent.localID = localID;

                if (this.options & BotOptionFlags.StoreMyAttachmentsOnly)
                {
                    for (const objParentID of Object.keys(this.objectsByParent))
                    {
                        const parent = parseInt(objParentID, 10);
                        if (parent !== this.agent.localID)
                        {
                            let foundAvatars = false;
                            for (const objID of this.objectsByParent[parent])
                            {
                                if (this.objects[objID])
                                {
                                    const o = this.objects[objID];
                                    if (o.PCode === PCode.Avatar)
                                    {
                                        foundAvatars = true;
                                    }
                                }
                            }
                            if (this.objects[parent])
                            {
                                const o = this.objects[parent];
                                if (o.PCode === PCode.Avatar)
                                {
                                    foundAvatars = true;
                                }
                            }
                            if (!foundAvatars)
                            {
                                this.deleteObject(parent);
                            }
                        }
                    }
                }
            }
            this.objects[localID].extraParams = ExtraParams.from(objData.ExtraParams);
            this.objects[localID].NameValue = this.parseNameValues(Utils.BufferToStringSimple(objData.NameValue));

            this.objects[localID].IsAttachment = this.objects[localID].NameValue['AttachItemID'] !== undefined;
            if (obj.IsAttachment && obj.State !== undefined)
            {
                this.objects[localID].attachmentPoint = this.decodeAttachPoint(obj.State);
            }

            this.objectsByUUID[objData.FullID.toString()] = localID;
            if (!this.objectsByParent[parentID])
            {
                this.objectsByParent[parentID] = [];
            }
            if (addToParentList)
            {
                this.objectsByParent[parentID].push(localID);
            }

            if (objData.PCode !== PCode.Avatar && this.options & BotOptionFlags.StoreMyAttachmentsOnly && (this.agent.localID !== 0 && obj.ParentID !== this.agent.localID))
            {
                // Drop object
                this.deleteObject(localID);
            }
            else
            {
                this.insertIntoRtree(obj);
                if (objData.ParentID !== undefined && objData.ParentID !== 0 && !this.objects[objData.ParentID])
                {
                    this.requestMissingObject(objData.ParentID).then(() =>
                    {
                    }).catch(() =>
                    {
                    });
                }
                this.notifyObjectUpdate(newObject, obj);
                obj.onTextureUpdate.next();
            }
        }
    }

    protected objectUpdateCached(objectUpdateCached: ObjectUpdateCachedMessage): void
    {
        if (!this.circuit)
        {
            return;
        }
        const rmo = new RequestMultipleObjectsMessage();
        rmo.AgentData = {
            AgentID: this.agent.agentID,
            SessionID: this.circuit.sessionID
        };
        rmo.ObjectData = [];
        for (const obj of objectUpdateCached.ObjectData)
        {
            if (!this.objects[obj.ID])
            {
                rmo.ObjectData.push({
                    CacheMissType: 0,
                    ID: obj.ID
                });
            }
        }
        if (rmo.ObjectData.length > 0)
        {
            if (!this.circuit)
            {
                return;
            }
            this.circuit.sendMessage(rmo, 0);
        }
    }

    protected async objectUpdateCompressed(objectUpdateCompressed: ObjectUpdateCompressedMessage): Promise<void>
    {
        for (const obj of objectUpdateCompressed.ObjectData)
        {
            const flags = obj.UpdateFlags;
            const buf = obj.Data;
            let pos = 0;

            const fullID = new UUID(buf, pos);
            pos += 16;
            const localID = buf.readUInt32LE(pos);
            pos += 4;
            const pcode = buf.readUInt8(pos++);
            let newObj = false;
            if (!this.objects[localID])
            {
                newObj = true;
                this.objects[localID] = new GameObject();
                this.objects[localID].region = this.agent.currentRegion;
            }
            const o = this.objects[localID];
            o.ID = localID;
            this.objectsByUUID[fullID.toString()] = localID;
            o.FullID = fullID;
            o.Flags = flags;
            o.PCode = pcode;
            o.deleted = false;
            o.State = buf.readUInt8(pos++);
            o.CRC = buf.readUInt32LE(pos);
            pos = pos + 4;
            o.Material = buf.readUInt8(pos++);
            o.ClickAction = buf.readUInt8(pos++);
            o.Scale = new Vector3(buf, pos, false);
            pos = pos + 12;
            o.Position = new Vector3(buf, pos, false);
            pos = pos + 12;
            o.Rotation = new Quaternion(buf, pos);
            pos = pos + 12;
            const compressedflags: CompressedFlags = buf.readUInt32LE(pos);
            pos = pos + 4;
            o.OwnerID = new UUID(buf, pos);
            pos += 16;

            if (compressedflags & CompressedFlags.HasAngularVelocity)
            {
                o.AngularVelocity = new Vector3(buf, pos, false);
                pos = pos + 12;
            }
            let newParentID = 0;
            if (compressedflags & CompressedFlags.HasParent)
            {
                newParentID = buf.readUInt32LE(pos);
                pos += 4;
            }
            o.ParentID = newParentID;
            let add = true;
            if (!newObj && o.ParentID !== undefined)
            {
                if (newParentID !== o.ParentID)
                {
                    const index = this.objectsByParent[o.ParentID].indexOf(localID);
                    if (index !== -1)
                    {
                        this.objectsByParent[o.ParentID].splice(index, 1);
                    }
                }
                else if (this.objectsByParent[o.ParentID])
                {
                    add = false;
                }
            }
            if (add)
            {
                if (!this.objectsByParent[newParentID])
                {
                    this.objectsByParent[newParentID] = [];
                }
                this.objectsByParent[newParentID].push(localID);
            }

            if (pcode !== PCode.Avatar && newObj && this.options & BotOptionFlags.StoreMyAttachmentsOnly && (this.agent.localID !== 0 && o.ParentID !== this.agent.localID))
            {
                // Drop object
                this.deleteObject(localID);
                return;
            }
            else
            {
                if (o.ParentID !== undefined && o.ParentID !== 0 && !this.objects[o.ParentID])
                {
                    this.requestMissingObject(o.ParentID);
                }
                if (compressedflags & CompressedFlags.Tree)
                {
                    o.TreeSpecies = buf.readUInt8(pos++);
                }
                else if (compressedflags & CompressedFlags.ScratchPad)
                {
                    o.TreeSpecies = 0;
                    const scratchPadSize = buf.readUInt8(pos++);
                    // Ignore this data
                    pos = pos + scratchPadSize;
                }
                if (compressedflags & CompressedFlags.HasText)
                {
                    // Read null terminated string
                    const result = Utils.BufferToString(buf, pos);

                    pos += result.readLength;
                    o.Text = result.result;
                    o.TextColor = new Color4(buf, pos, false, true);
                    pos = pos + 4;
                }
                else
                {
                    o.Text = '';
                }
                if (compressedflags & CompressedFlags.MediaURL)
                {
                    const result = Utils.BufferToString(buf, pos);

                    pos += result.readLength;
                    o.MediaURL = result.result;
                }
                if (compressedflags & CompressedFlags.HasParticles)
                {
                    o.Particles = ParticleSystem.from(buf.slice(pos, pos + 86));
                    pos += 86;
                }

                // Extra params
                const extraParamsLength = ExtraParams.getLengthOfParams(buf, pos);
                o.extraParams = ExtraParams.from(buf.slice(pos, pos + extraParamsLength));
                pos += extraParamsLength;

                if (compressedflags & CompressedFlags.HasSound)
                {
                    o.Sound = new UUID(buf, pos);
                    pos = pos + 16;
                    o.SoundGain = buf.readFloatLE(pos);
                    pos += 4;
                    o.SoundFlags = buf.readUInt8(pos++);
                    o.SoundRadius = buf.readFloatLE(pos);
                    pos = pos + 4;
                }
                if (compressedflags & CompressedFlags.HasNameValues)
                {
                    const result = Utils.BufferToString(buf, pos);
                    o.NameValue = this.parseNameValues(result.result);
                    pos += result.readLength;
                }
                o.PathCurve = buf.readUInt8(pos++);
                o.PathBegin = Utils.unpackBeginCut(buf.readUInt16LE(pos));
                pos = pos + 2;
                o.PathEnd = Utils.unpackEndCut(buf.readUInt16LE(pos));
                pos = pos + 2;
                o.PathScaleX = Utils.unpackPathScale(buf.readUInt8(pos++));
                o.PathScaleY = Utils.unpackPathScale(buf.readUInt8(pos++));
                o.PathShearX = Utils.unpackPathShear(buf.readUInt8(pos++));
                o.PathShearY = Utils.unpackPathShear(buf.readUInt8(pos++));
                o.PathTwist = Utils.unpackPathTwist(buf.readUInt8(pos++));
                o.PathTwistBegin = Utils.unpackPathTwist(buf.readUInt8(pos++));
                o.PathRadiusOffset = Utils.unpackPathTwist(buf.readUInt8(pos++));
                o.PathTaperX = Utils.unpackPathTaper(buf.readUInt8(pos++));
                o.PathTaperY = Utils.unpackPathTaper(buf.readUInt8(pos++));
                o.PathRevolutions = Utils.unpackPathRevolutions(buf.readUInt8(pos++));
                o.PathSkew = Utils.unpackPathTwist(buf.readUInt8(pos++));
                o.ProfileCurve = buf.readUInt8(pos++);
                o.ProfileBegin = Utils.unpackBeginCut(buf.readUInt16LE(pos));
                pos = pos + 2;
                o.ProfileEnd = Utils.unpackEndCut(buf.readUInt16LE(pos));
                pos = pos + 2;
                o.ProfileHollow = Utils.unpackProfileHollow(buf.readUInt16LE(pos));
                pos = pos + 2;
                const textureEntryLength = buf.readUInt32LE(pos);
                pos = pos + 4;
                o.TextureEntry = TextureEntry.from(buf.slice(pos, pos + textureEntryLength));
                pos = pos + textureEntryLength;

                if (compressedflags & CompressedFlags.TextureAnimation)
                {
                    const textureAnimLength = buf.readUInt32LE(pos);
                    pos = pos + 4;
                    o.textureAnim = TextureAnim.from(buf.slice(pos, pos + textureAnimLength));
                }

                o.IsAttachment = (compressedflags & CompressedFlags.HasNameValues) !== 0 && o.ParentID !== 0;
                if (o.IsAttachment && o.State !== undefined)
                {
                    this.objects[localID].attachmentPoint = this.decodeAttachPoint(o.State);
                }

                this.insertIntoRtree(o);

                this.notifyObjectUpdate(newObj, o);
                o.onTextureUpdate.next();
            }
        }
    }

    protected objectUpdateTerse(objectUpdateTerse: ImprovedTerseObjectUpdateMessage): void
    {
        const dilation = objectUpdateTerse.RegionData.TimeDilation / 65535.0;
        this.clientEvents.onRegionTimeDilation.next(dilation);

        for (let i = 0; i < objectUpdateTerse.ObjectData.length; i++)
        {
            const objectData = objectUpdateTerse.ObjectData[i];
            if (!(this.options & BotOptionFlags.StoreMyAttachmentsOnly))
            {
                let pos = 0;
                const localID = objectData.Data.readUInt32LE(pos);
                pos = pos + 4;
                if (this.objects[localID])
                {
                    this.objects[localID].State = objectData.Data.readUInt8(pos++);
                    const avatar: boolean = (objectData.Data.readUInt8(pos++) !== 0);
                    if (avatar)
                    {
                        this.objects[localID].CollisionPlane = new Vector4(objectData.Data, pos);
                        pos += 16;
                    }
                    this.objects[localID].Position = new Vector3(objectData.Data, pos);
                    pos += 12;
                    this.objects[localID].Velocity = new Vector3([
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos), -128.0, 128.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 2), -128.0, 128.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 4), -128.0, 128.0)
                    ]);
                    pos += 6;
                    this.objects[localID].Acceleration = new Vector3([
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos), -64.0, 64.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 2), -64.0, 64.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 4), -64.0, 64.0)
                    ]);
                    pos += 6;
                    this.objects[localID].Rotation = new Quaternion([
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos), -1.0, 1.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 2), -1.0, 1.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 4), -1.0, 1.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 6), -1.0, 1.0)
                    ]);
                    pos += 8;
                    this.objects[localID].AngularVelocity = new Vector3([
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos), -64.0, 64.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 2), -64.0, 64.0),
                        Utils.UInt16ToFloat(objectData.Data.readUInt16LE(pos + 4), -64.0, 64.0)
                    ]);
                    pos += 6;

                    if (objectData.TextureEntry.length > 0)
                    {
                        // No idea why the first four bytes are skipped here.
                        this.objects[localID].TextureEntry = TextureEntry.from(objectData.TextureEntry.slice(4));
                        this.objects[localID].onTextureUpdate.next();
                    }
                    this.insertIntoRtree(this.objects[localID]);
                    this.notifyTerseUpdate(this.objects[localID]);

                }
                else
                {
                    // We don't know about this object, so request it
                    this.requestMissingObject(localID).catch(() =>
                    {

                    });
                }
            }
        }
    }
}
