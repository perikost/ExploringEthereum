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

  struct CIDuint {
    bytes32 hashDigest;
    uint64 hashFunction;
    uint64 hashSize;
    uint64 multicodec;
    uint64 version;
  }

  CID public cid;
  CIDuint public cidUint;  // uint test
  string public cid0;
  string public cid1;
  bytes32 public hashDigest;

  event completeCid0(string cid);
  event completeCid1(string cid);
  event selfDescribedCid(bytes32 hashDigest, bytes8 hashFunction, bytes8 hashSize, bytes8 multicodec, bytes8 version);

  function storeCid(bytes32 _hashDigest, bytes8 _hashFunction, bytes8 _hashSize, bytes8 _multicodec, bytes8 _version) external{
    cid.hashDigest = _hashDigest; 
    cid.hashFunction = _hashFunction; 
    cid.hashSize = _hashSize; 
    cid.multicodec = _multicodec; 
    cid.version = _version; 
  }

  // uint test
  function storeCidUint(bytes32 _hashDigest, uint64 _hashFunction, uint64 _hashSize, uint64 _multicodec, uint64 _version) external{
    cidUint.hashDigest = _hashDigest; 
    cidUint.hashFunction = _hashFunction; 
    cidUint.hashSize = _hashSize; 
    cidUint.multicodec = _multicodec; 
    cidUint.version = _version; 
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

  function logCid0(string calldata  _cid) external {
    emit completeCid0(_cid);
  }

  function logCid1(string calldata  _cid) external {
    emit completeCid1(_cid);
  }

  function logSelfDescribedCid(bytes32 _hashDigest, bytes8 _hashFunction, bytes8 _hashSize, bytes8 _multicodec, bytes8 _version) external {
    emit selfDescribedCid(_hashDigest, _hashFunction, _hashSize, _multicodec, _version);
  }

  function reset() external{
    delete cid; 
    delete cid0;
    delete cid1;
    delete hashDigest;
    delete cidUint;  // uint test
  }

}