// SPDX-License-Identifier: MIT

pragma solidity 0.8.12;

contract DFS{

  struct CID {
    bytes32 hashDigest;
    bytes8 hashFunction;
    bytes8 hashSize;
    bytes8 multicodec;
    bytes8 version;
  }

  CID public cid;
  string public cid0;
  string public cid1;
  bytes32 public hashDigest;
  bytes32 public swarmHash;
  bytes public swarmHashEncrypted;

  event completeCid0(string cid);
  event completeCid1(string cid);
  event digest(bytes32 hashDigest);
  event swarm(bytes32 swarmHash);
  event swarmEnc(bytes swarmHashEncrypted);
  event selfDescribedCid(bytes32 hashDigest, bytes8 hashFunction, bytes8 hashSize, bytes8 multicodec, bytes8 version);

  function storeCid(bytes32 _hashDigest, bytes8 _hashFunction, bytes8 _hashSize, bytes8 _multicodec, bytes8 _version) external{
    cid.hashDigest = _hashDigest; 
    cid.hashFunction = _hashFunction; 
    cid.hashSize = _hashSize; 
    cid.multicodec = _multicodec; 
    cid.version = _version; 
  }

  function storeCid0(string calldata _cid) external{
      cid0 = _cid;
  }
  
  function storeCid1(string calldata _cid) external{
      cid1 = _cid;
  }

  function storeHashDigest(bytes32 _hashDigest) external{
      hashDigest = _hashDigest;
  }

  function storeSwarmHash(bytes32 _hash) external{
      swarmHash = _hash;
  }

  function storeSwarmHashEncrypted(bytes calldata _hash) external{
      swarmHashEncrypted = _hash;
  }

  function logCid0(string calldata  _cid) external {
    emit completeCid0(_cid);
  }

  function logCid1(string calldata  _cid) external {
    emit completeCid1(_cid);
  }

  function logHashDigest(bytes32 _hashDigest) external {
    emit digest(_hashDigest);
  }

  function logSwarm(bytes32 _hash) external {
    emit swarm(_hash);
  }

  function logSwarmEncrypted(bytes calldata  _hash) external {
    emit swarmEnc(_hash);
  }

  function logSelfDescribedCid(bytes32 _hashDigest, bytes8 _hashFunction, bytes8 _hashSize, bytes8 _multicodec, bytes8 _version) external {
    emit selfDescribedCid(_hashDigest, _hashFunction, _hashSize, _multicodec, _version);
  }

  function reset() external{
    delete cid; 
    delete cid0;
    delete cid1;
    delete hashDigest;
    delete swarmHash;
    delete swarmHashEncrypted;
  }

}