interface IBranch {
  isSelected: boolean;
  name: string;
}

class Branch implements IBranch {
  readonly isSelected: boolean;
  readonly name: string;

  constructor(params: IBranch) {
    this.name = params.name;
    this.isSelected = params.isSelected;
  }
}

export default Branch;
